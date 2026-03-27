# RHINO RACK — Internal Brain

> This is the private, full-context version of the RHINO RACK project.
> The public repo (`rhino-rack`) is the sanitised portfolio version.
> This one has everything — architecture decisions, credentials locations, AI context, internal notes, and the full picture of what's built and why.

---

## What This Repo Is

`RHINO_RACK_1` is the single source of truth for the entire RHINO RACK homelab system.
It is private and doubles as persistent context for the AI assistant (Jarvis) so any new session can read this and know exactly what the system looks like without having to re-explain.

The public `rhino-rack` repo is a sanitised copy for employer/portfolio use — no IPs, no credentials, no internal notes.

---

## Hardware — Full Inventory

| Device | Role | IP | User | OS |
|--------|------|----|------|----|
| **pinas** (RPi 4B, 8GB) | NAS + main server | 192.168.1.109 (local) / Tailscale | rhino_pi_nas | Debian Bookworm (arm64) |
| **RackModule1** (RPi 3B, 1GB) | Spare / ECU tuning backend | 192.168.1.110 (static, ethernet) | rhino_rackmodule_1 | Debian Trixie (arm64) |
| **Mac M5** | Daily driver, Claude Code host | — | abhiramanil | macOS |
| **Gaming PC** | Windows, spare / future Ollama host | — | — | Windows 11 |
| **Samsung S25 Ultra** | Phone, PWA client | — | — | Android |

**Router:** TP-Link Archer MR600 (Optus 4G/5G SIM)
**Rack:** KWS Rack v.2 (3D-printed 10" homelab rack from MakerWorld)
**Storage:** Samsung PSSD T7 1TB at `/mnt/ssd` (exFAT), mounted on pinas

---

## Network Map

```
192.168.1.1    — Router (TP-Link MR600)
192.168.1.109  — pinas (RPi 4B) — main server
192.168.1.110  — RackModule1 (RPi 3B) — static, ethernet
192.168.1.xxx  — Mac M5
192.168.1.xxx  — Samsung S25 Ultra (WiFi)
```

**Tailscale:** pinas also accessible remotely via Tailscale VPN
**DNS:** 1.1.1.1 / 8.8.8.8 locked with `chattr +i` on both Pis (Pi-hole removed)

---

## pinas — Full Service Map

### Docker Containers (13 running)

| Container | Port | Stack dir | Notes |
|-----------|------|-----------|-------|
| jellyfin | 8096 | stacks/jellyfin | Media server |
| immich_server | 2283 | stacks/immich | Photo management |
| immich_ml | — | stacks/immich | ML face/object recognition |
| immich_postgres | — | stacks/immich | DB for Immich |
| immich_redis | — | stacks/immich | Cache for Immich |
| grafana | 3000 | stacks/monitoring | Dashboards — "RHINO RACK Overview" set as home |
| prometheus | 9090 | stacks/monitoring | Scrapes pinas:9100 + rackmodule1:9100 every 15s |
| node_exporter | 9100 | stacks/monitoring | pinas system metrics |
| n8n | 5678 | stacks/n8n | "Terry - AI Homelab Monitor" workflow active |
| portainer | 9000 | — | Container management UI |
| homarr | 7575 | stacks/homarr | Home dashboard |
| uptime-kuma | 3001 | stacks/uptime-kuma | Service uptime monitoring |
| watchtower | — | stacks/watchtower | Daily 4am AEDT auto-update |

### Bare Services (systemd)

| Service | Port | Location | Notes |
|---------|------|----------|-------|
| claude-monitor | 3005 | /opt/stacks/claude-monitor/ | Kiosk dashboard + AI activity log |
| rack-kiosk | — | kiosk/ | Chromium kiosk on HDMI display |

### Storage
- `/` — SD card (64GB)
- `/mnt/ssd` — Samsung T7 1TB (exFAT, USB 3.2)
- OMV writecache (950MB tmpfs) — flushed daily 3am via `/etc/cron.d/omv-writecache-daily`

### Security
- UFW active, all service ports open
- fail2ban running
- SSH key-only, root login disabled
- Discord approval hook intercepts dangerous bash commands

---

## RackModule1 — Full State

- **OS:** Debian Trixie (Raspberry Pi OS Lite 64-bit, aarch64)
- **RAM:** 906MB | **Disk:** 29GB SD card (15% used as of 2026-03-27)
- **SSH:** Key auth only (jarvis-mac-m5 key), root login disabled
- **node_exporter:** `prometheus-node-exporter` systemd service, enabled, port 9100
- **UFW + fail2ban:** Active
- **Current role:** Bare server — visible on kiosk dashboard, ready for AI ECU tuning project
- **Planned role:** In-car CAN bus reader + WebSocket client for ECU tuning assistant

---

## Kiosk Dashboard — Technical Detail

**File:** `/opt/stacks/claude-monitor/index.html` (served by server.js, loaded at startup)
**Important:** HTML is loaded once at service start via `fs.readFileSync`. After editing index.html you MUST `sudo systemctl restart claude-monitor` for changes to take effect.

**Layout:** 1600×600px fixed, 3-panel grid (380|840|380px)

**Left panel:**
- RHINO RACK hostname row + Tailscale badge
- 3x SVG arc gauges: CPU / RAM / Temp (r=46, circ=289.03)
- Storage: SD Card + SSD only (empty slots removed)
- Network RX/TX + uptime
- RACKMODULE1 section: 3x smaller SVG arc gauges (r=34, circ=213.63) CPU/RAM/Temp + SD card bar
  - Fetches `/api/module1-stats` every 5s — shows OFFLINE dot if unreachable

**Centre panel:** Docker container tiles (SVG logos, status dots, grouping), clock

**Right panel:** RACK AI HUD — animated SVG rings, scan sweep, natural-language AI activity feed

**Refresh kiosk browser:**
```bash
sudo DISPLAY=:0 XAUTHORITY=/root/.Xauthority xdotool key F5
```

---

## Jarvis Memory System

Jarvis (Claude Code) saves persistent memory to the SSD on pinas so it survives sessions and is accessible from any device.

**Memory location on SSD:** `/mnt/ssd/jarvis_memory/`
**Memory location on Mac:** `/Users/abhiramanil/.claude/projects/-Users-abhiramanil/memory/`
**Sync script:** `~/jarvis_sync.sh` (pull/push via rsync over SSH)

Memory is auto-synced:
- **SessionStart hook:** pulls from NAS before first response
- **Stop hook:** pushes to NAS after session ends
- **PostToolUse (Write/Edit):** pushes immediately after any memory file is written

---

## Active Projects

### 1. AI ECU Tuning Assistant (not yet built)
Full spec in `stacks/ai-monitor/` (to be added) and in Jarvis memory (`project_ai_ecu_tuning.md`).

**Goal:** Read live CAN data from Haltech Elite 1500 ECU, AI analyses it, suggests tuning changes, Abhiram approves on phone via PWA.

**Architecture:**
```
Haltech Elite 1500 ECU
    ↓ CAN bus (aux 4-pin Deutsch: CAN-H pin 3, CAN-L pin 4)
PSA3018C USB CAN analyser (CH341-based slcan, owned)
    ↓ USB → /dev/ttyUSB0
RackModule1 (RPi 3, in car)
    ↓ WiFi (S25 Ultra hotspot)
pinas NAS (FastAPI/Node.js backend + Claude API)
    ↓
PWA on S25 Ultra (live gauges + AI suggestions + approve/reject)
```

**Status:** Architecture decided, no code written yet. Next: flash RPi 3 for car use, test PSA3018C, write CAN reader.

**Vehicle:** Mazda 323 SP20, FS-DE 2.0L, Haltech Elite 1500, 2058 turbo, stock internals (max 7-10 psi safe), WRX STI 565cc injectors (purchased, not yet installed)

### 2. Local LLM on Gaming PC (not yet built)
- Goal: Ollama + LiteLLM on Gaming PC, Claude Code on Pi connects via `ANTHROPIC_BASE_URL`
- Model: Qwen2.5-Coder 32B (~20GB quantized, fits in 32GB RAM)
- Status: Waiting for Gaming PC to get Linux installed

---

## Known Issues / Gotchas

- OMV writecache fills up if not flushed — daily cron at 3am handles it
- Immich ML causes high NAS load average during indexing — normal, wait it out
- NSP (Haltech tuning software) won't work on Mac M5 Parallels — FTDI D2XX .NET wrapper incompatible with ARM64 Windows. Must use Gaming PC (x64 Windows).
- node_exporter on RackModule1 is `prometheus-node-exporter` systemd service (not custom binary)
- Pi-hole was removed — was blocking DNS/NTP/Claude API access due to `network_mode: host`

---

## Credentials / Secrets Location

Credentials are NOT stored in this repo. They live in:
- `/opt/stacks/*/env` or `.env` files on pinas
- `global.env` at `/opt/stacks/global.env`
- Environment variables in systemd service files

Key env vars needed for claude-monitor:
- `DISCORD_BOT_TOKEN` — RhinoRack Admin bot
- `PIHOLE_PASS` — (Pi-hole removed, kept for reference)
- `PIHOLE_TOTP_SECRET` — (same)

Discord channel ID: `900016926963691623` (#general in "RHINO's server")

---

## Git Workflow

**Public repo** (`rhino-rack`): Portfolio-safe. Push sanitised code + docs. No IPs, no credentials.
**This repo** (`RHINO_RACK_1`): Full internal state. Update whenever something changes on the rack.

To update this repo after making changes on the rack:
```bash
# On Mac
cd /tmp/RHINO_RACK_1
# copy updated files from NAS
scp rhino_pi_nas@192.168.1.109:/opt/stacks/claude-monitor/server.js stacks/ai-monitor/server.js
scp rhino_pi_nas@192.168.1.109:/opt/stacks/claude-monitor/index.html stacks/ai-monitor/index.html
git add -A && git commit -m "update: <what changed>" && git push
```
