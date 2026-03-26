const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3005;
const ACTIVITY_LOG = path.join(__dirname, 'activity.log');

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      resolve(stdout || stderr || '');
    });
  });
}

// Accurate CPU via /proc/stat delta between consecutive calls + rolling average
let _lastStat = null;
const _cpuHistory = [];
const CPU_SMOOTH = 5; // average over last 5 samples (~15s at 3s poll)

// --- RackModule1 metrics (fetched from node_exporter at 192.168.1.110:9100) ---
let _m1LastCpu = null;
const _m1CpuHistory = [];


function readProcStat() {
  try {
    const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const vals = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = vals[3] + (vals[4] || 0); // idle + iowait
    const total = vals.reduce((a, b) => a + b, 0);
    return { idle, total };
  } catch (_) { return null; }
}

function getCpuUsage() {
  const s2 = readProcStat();
  if (!s2) return _cpuHistory.length ? (_cpuHistory.reduce((a,b)=>a+b,0)/_cpuHistory.length).toFixed(1) : null;
  if (_lastStat) {
    const idleDelta = s2.idle - _lastStat.idle;
    const totalDelta = s2.total - _lastStat.total;
    if (totalDelta > 0) {
      const sample = 100 * (1 - idleDelta / totalDelta);
      _cpuHistory.push(sample);
      if (_cpuHistory.length > CPU_SMOOTH) _cpuHistory.shift();
    }
  }
  _lastStat = s2;
  if (!_cpuHistory.length) return null;
  const avg = _cpuHistory.reduce((a, b) => a + b, 0) / _cpuHistory.length;
  return avg.toFixed(1);
}

// --- Pi-hole stats (cached, refreshed every 30s) ---
let _piholeCache = null;
let _piholeCacheTime = 0;
const PIHOLE_PASS = process.env.PIHOLE_PASS || '';
const PIHOLE_TOTP_SECRET = process.env.PIHOLE_TOTP_SECRET || '';
const https_mod = require('https');

function getPiholeTotp() {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = Buffer.alloc(Math.floor(PIHOLE_TOTP_SECRET.length * 5 / 8));
  let bits = 0, val = 0, idx = 0;
  for (const c of PIHOLE_TOTP_SECRET.toUpperCase()) {
    val = (val << 5) | base32chars.indexOf(c);
    bits += 5;
    if (bits >= 8) { secret[idx++] = (val >>> (bits - 8)) & 0xff; bits -= 8; }
  }
  const t = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(t / 0x100000000), 0);
  msg.writeUInt32BE(t >>> 0, 4);
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  const code = hmac.readUInt32BE(o) & 0x7fffffff;
  return code % 1000000;
}

async function getPiholeStats() {
  if (_piholeCache && Date.now() - _piholeCacheTime < 30000) return _piholeCache;
  try {
    const authBody = JSON.stringify({ password: PIHOLE_PASS, totp: getPiholeTotp() });
    const authResp = await new Promise((resolve, reject) => {
      const req = http.request({ host: '192.168.1.109', port: 80, path: '/api/auth', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(authBody) }
      }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
      req.on('error', reject); req.write(authBody); req.end();
    });
    const sid = authResp?.session?.sid;
    if (!sid) return null;
    const stats = await new Promise((resolve, reject) => {
      const req = http.request({ host: '192.168.1.109', port: 80, path: '/api/stats/summary', method: 'GET',
        headers: { 'sid': sid }
      }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
      req.on('error', reject); req.end();
    });
    _piholeCache = {
      total: stats.queries?.total || 0,
      blocked: stats.queries?.blocked || 0,
      pctBlocked: (stats.queries?.percent_blocked || 0).toFixed(1),
      cached: stats.queries?.cached || 0,
      clients: stats.clients?.active || 0,
      domains: stats.gravity?.domains_being_blocked || 0,
    };
    _piholeCacheTime = Date.now();
    return _piholeCache;
  } catch (_) { return _piholeCache; }
}

async function getModule1Stats() {
  return new Promise((resolve) => {
    const req = http.get({ host: '192.168.1.110', port: 9100, path: '/metrics', timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          let idle = 0, total = 0;
          for (const line of data.split('\n')) {
            if (!line.startsWith('node_cpu_seconds_total')) continue;
            const modeM = line.match(/mode="(\w+)"/);
            const valM  = line.match(/}\s+([\d.]+)/);
            if (!modeM || !valM) continue;
            const v = parseFloat(valM[1]);
            total += v;
            if (modeM[1] === 'idle') idle += v;
          }
          let cpuPct = null;
          if (_m1LastCpu) {
            const dIdle  = idle  - _m1LastCpu.idle;
            const dTotal = total - _m1LastCpu.total;
            if (dTotal > 0) {
              const s = 100 * (1 - dIdle / dTotal);
              _m1CpuHistory.push(s);
              if (_m1CpuHistory.length > 5) _m1CpuHistory.shift();
            }
          }
          _m1LastCpu = { idle, total };
          if (_m1CpuHistory.length) {
            cpuPct = (_m1CpuHistory.reduce((a,b)=>a+b,0) / _m1CpuHistory.length).toFixed(1);
          }
          const memTotalB  = parseFloat((data.match(/^node_memory_MemTotal_bytes ([\d.e+]+)/m) || [])[1] || 0);
          const memAvailB  = parseFloat((data.match(/^node_memory_MemAvailable_bytes ([\d.e+]+)/m) || [])[1] || 0);
          const memUsedMB  = Math.round((memTotalB - memAvailB) / 1048576);
          const memTotalMB = Math.round(memTotalB / 1048576);
          const tempM = data.match(/node_thermal_zone_temp\{[^}]*\}\s+([\d.]+)/);
          const tempC = tempM ? parseFloat(tempM[1]).toFixed(1) : null;
          let diskSize = 0, diskAvail = 0;
          for (const line of data.split('\n')) {
            if (!line.startsWith('node_filesystem_size_bytes') && !line.startsWith('node_filesystem_avail_bytes')) continue;
            const mpM = line.match(/mountpoint="([^"]+)"/);
            if (!mpM || mpM[1] !== '/') continue;
            const v = parseFloat(line.split(' ').pop());
            if (line.startsWith('node_filesystem_size_bytes'))  diskSize  = v;
            if (line.startsWith('node_filesystem_avail_bytes')) diskAvail = v;
          }
          const diskUsedGB  = diskSize > 0 ? ((diskSize - diskAvail) / 1e9).toFixed(1) : null;
          const diskTotalGB = diskSize > 0 ? (diskSize / 1e9).toFixed(1) : null;
          const diskPct     = diskSize > 0 ? Math.round((diskSize - diskAvail) / diskSize * 100) : null;
          resolve({ online: true, cpu: cpuPct, mem: { used: memUsedMB, total: memTotalMB },
            temp: tempC, disk: { usedGB: diskUsedGB, totalGB: diskTotalGB, pct: diskPct },
            timestamp: new Date().toISOString() });
        } catch(e) { resolve({ online: false }); }
      });
    });
    req.on('error', () => resolve({ online: false }));
    req.on('timeout', () => { req.destroy(); resolve({ online: false }); });
  });
}

async function gatherStats() {
  const cpuUsage = getCpuUsage();
  const [iface, wireless, ss, mem, disk, uptime, temp, arp, netDev, dockerPs, tailscale, lsblkRaw, dockerAll] = await Promise.all([
    run("ip -s link show end0 2>/dev/null || ip -s link show eth0 2>/dev/null"),
    run("cat /proc/net/wireless 2>/dev/null"),
    run("ss -tulnp 2>/dev/null"),
    run("free -m 2>/dev/null"),
    run("df -h / 2>/dev/null"),
    run("uptime -p 2>/dev/null"),
    run("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null"),
    run("arp -a 2>/dev/null"),
    run("cat /proc/net/dev 2>/dev/null"),
    run("docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}' 2>/dev/null"),
    run("tailscale status 2>/dev/null | head -3"),
    run("lsblk -J -b -o NAME,SIZE,TYPE,MODEL,MOUNTPOINT 2>/dev/null"),
    run("docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}' 2>/dev/null"),
  ]);

  const memLines = mem.trim().split('\n');
  let memUsed = 0, memTotal = 0;
  if (memLines[1]) {
    const parts = memLines[1].split(/\s+/);
    memTotal = parseInt(parts[1]); memUsed = parseInt(parts[2]);
  }

  const diskLine = disk.trim().split('\n')[1] || '';
  const diskParts = diskLine.split(/\s+/);

  // Parse lsblk JSON for all sd* block devices
  let rawDrives = [];
  try {
    const blk = JSON.parse(lsblkRaw);
    for (const dev of (blk.blockdevices || [])) {
      if (dev.type === 'disk' && /^sd/.test(dev.name)) {
        let mountpoint = null;
        if (dev.children) {
          for (const child of dev.children) {
            if (child.mountpoint && !mountpoint) mountpoint = child.mountpoint;
          }
        }
        rawDrives.push({
          name: dev.name,
          model: (dev.model || '').trim(),
          sizeGB: ((parseInt(dev.size) || 0) / 1e9).toFixed(1),
          mountpoint,
        });
      }
    }
  } catch (_) {}

  // Get df stats for any mounted drives (second pass)
  const drives = await Promise.all(rawDrives.map(async d => {
    const [dfout, smart] = await Promise.all([
      d.mountpoint ? run(`df -h ${d.mountpoint} 2>/dev/null`) : Promise.resolve(''),
      run(`sudo smartctl -A /dev/${d.name} 2>/dev/null`),
    ]);
    const p = (dfout.trim().split('\n')[1] || '').split(/\s+/);
    // Parse NVMe SMART fields
    let smartData = {};
    const tempMatch = smart.match(/Temperature[^\n]*?(\d+)\s+Celsius/i);
    const spareMatch = smart.match(/Available Spare:\s+(\d+)%/i);
    const usedMatch = smart.match(/Percentage Used:\s+(\d+)%/i);
    const errMatch = smart.match(/Media and Data Integrity Errors:\s+(\d+)/i);
    const unsafeMatch = smart.match(/Unsafe Shutdowns:\s+(\d+)/i);
    if (tempMatch) smartData.tempC = parseInt(tempMatch[1]);
    if (spareMatch) smartData.spareAvail = parseInt(spareMatch[1]);
    if (usedMatch) smartData.wearPct = parseInt(usedMatch[1]);
    if (errMatch) smartData.mediaErrors = parseInt(errMatch[1]);
    if (unsafeMatch) smartData.unsafeShutdowns = parseInt(unsafeMatch[1]);
    if (!d.mountpoint) return { ...d, mounted: false, smart: smartData };
    return { ...d, mounted: true, used: p[2] || '?', total: p[1] || '?', pct: p[4] || '?', smart: smartData };
  }));

  const tempVal = temp.trim() ? (parseInt(temp.trim()) / 1000).toFixed(1) : null;

  let rxBytes = 0, txBytes = 0;
  for (const line of netDev.trim().split('\n')) {
    if (line.includes('end0') || line.includes('eth0')) {
      const p = line.trim().split(/\s+/);
      rxBytes = parseInt(p[1]) || 0; txBytes = parseInt(p[9]) || 0;
    }
  }

  const ports = [];
  for (const line of ss.split('\n')) {
    const m = line.match(/LISTEN\s+\S+\s+\S+\s+[*0-9.:]+:(\d+)/);
    if (m) { const p = parseInt(m[1]); if (!ports.includes(p)) ports.push(p); }
  }
  ports.sort((a, b) => a - b);

  const devices = [];
  for (const line of arp.split('\n')) {
    const m = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
    if (m && !devices.includes(m[1])) devices.push(m[1]);
  }

  const containers = dockerAll.trim() ? dockerAll.trim().split('\n').map(l => {
    const [name, status, ports] = l.split('|');
    return { name, status, ports: ports || '' };
  }) : [];

  const tsActive = tailscale.length > 0 && !tailscale.includes('not logged in') && !tailscale.includes('Tailscale is stopped');

  return {
    cpu: cpuUsage,
    mem: { used: memUsed, total: memTotal },
    sdcard: { used: diskParts[2] || '?', total: diskParts[1] || '?', pct: diskParts[4] || '?' },
    drives,
    temp: tempVal,
    uptime: uptime.trim().replace('up ', ''),
    network: { rxBytes, txBytes },
    ports,
    devices,
    containers,
    tailscale: { active: tsActive },
    pihole: await getPiholeStats(),
    timestamp: new Date().toISOString(),
  };
}

// --- SSE clients ---
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}

// --- Tail the activity log ---
let logOffset = 0;
try { logOffset = fs.statSync(ACTIVITY_LOG).size; } catch (_) {}

fs.watchFile(ACTIVITY_LOG, { interval: 200 }, () => {
  try {
    const stat = fs.statSync(ACTIVITY_LOG);
    if (stat.size <= logOffset) return;
    const fd = fs.openSync(ACTIVITY_LOG, 'r');
    const buf = Buffer.alloc(stat.size - logOffset);
    fs.readSync(fd, buf, 0, buf.length, logOffset);
    fs.closeSync(fd);
    logOffset = stat.size;
    const lines = buf.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        broadcast('activity', ev);
      } catch (_) {}
    }
  } catch (_) {}
});

// --- Recent activity from log ---
function getRecentActivity(n = 60) {
  try {
    const content = fs.readFileSync(ACTIVITY_LOG, 'utf8');
    return content.trim().split('\n').filter(Boolean).slice(-n).map(l => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}

// --- Static HTML ---
const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// --- Agent results ---
global.agentResults = [
  {
    id: 'wifi-rater', name: 'WiFi Signal Rater', icon: '📶', status: 'completed',
    rating: 'N/A', ratingColor: '#f59e0b',
    summary: 'wlan0 is DOWN — not associated to any network',
    details: [
      { label: 'Interface', value: 'wlan0 (DOWN)' },
      { label: 'Last Channel', value: 'Ch 34 / 5170 MHz (5GHz)' },
      { label: 'Active Link', value: 'Ethernet (end0) in use' },
    ],
    recommendation: 'Device runs on Ethernet. WiFi disabled.',
    completedAt: new Date().toISOString(),
  },
  {
    id: 'perf-tester', name: 'Performance Tester', icon: '⚡', status: 'completed',
    rating: 'GOOD', ratingColor: '#22c55e',
    summary: '122.7 Mbps down · 5.13 Mbps up · 0% packet loss',
    details: [
      { label: 'Download', value: '122.70 Mbps' },
      { label: 'Upload', value: '5.13 Mbps' },
      { label: 'Gateway Latency', value: '0.35 ms avg' },
      { label: 'Packet Loss', value: '0%' },
    ],
    recommendation: 'Upload asymmetry is ISP-imposed. Minor DNS jitter suggests bufferbloat.',
    completedAt: new Date().toISOString(),
  },
  {
    id: 'security-auditor', name: 'Security Auditor', icon: '🔒', status: 'completed',
    rating: 'LOW RISK', ratingColor: '#22c55e',
    summary: 'Private homelab · Tailscale only external exposure',
    details: [
      { label: 'External Exposure', value: 'Tailscale only (WireGuard)' },
      { label: 'LAN', value: 'Private · trusted devices only' },
      { label: 'rpcbind (111)', value: 'Running — optional to disable' },
    ],
    recommendation: 'Tailscale is your only real external surface. Optionally disable rpcbind.',
    completedAt: new Date().toISOString(),
  },
];

const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  } else if (req.url === '/api/stats') {
    try {
      const stats = await gatherStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
  } else if (req.url === '/api/module1-stats') {
    getModule1Stats().then(s => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(s));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online: false }));
    });
  } else if (req.url === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(global.agentResults));
  } else if (req.url === '/api/activity') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getRecentActivity()));
  } else if (req.url === '/api/watchtower-notify' && req.method === 'POST') {
    // Receive Watchtower shoutrrr generic webhook and forward to Discord
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      res.writeHead(200); res.end('ok');
      try {
        const payload = JSON.parse(body);
        const msg = payload.message || payload.text || JSON.stringify(payload).slice(0, 400);
        const https = require('https');
        const content = 'Watchtower update report:\n' + msg;
        const data = JSON.stringify({ content: content.slice(0, 2000) });
        const opts = {
          hostname: 'discord.com',
          path: '/api/v10/channels/900016926963691623/messages',
          method: 'POST',
          headers: {
            'Authorization': 'Bot ' + (process.env.DISCORD_BOT_TOKEN || ''),
            'Content-Type': 'application/json',
            'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 10)',
            'Content-Length': Buffer.byteLength(data),
          },
        };
        const r = https.request(opts); r.on('error', ()=>{}); r.write(data); r.end();
      } catch (_) {}
    });
  } else if (req.url === '/api/events') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    // Send recent history on connect
    const recent = getRecentActivity(30);
    res.write(`event: history\ndata: ${JSON.stringify(recent)}\n\n`);
    const keepalive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) { clearInterval(keepalive); sseClients.delete(res); }
    }, 15000);
    req.on('close', () => { clearInterval(keepalive); sseClients.delete(res); });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude Monitor running at http://0.0.0.0:${PORT}`);
});
