# Kiosk Dashboard

The RHINO RACK kiosk displays a fullscreen 1600×600 dashboard on a dedicated HDMI panel. It runs Chromium in kiosk mode, launched by a systemd service at boot.

## Architecture

```
systemd (rack-kiosk.service)
  └── xinit → Xorg (VT1)
        └── .xinitrc
              ├── xrandr (set 1600×600)
              ├── openbox (window manager)
              └── chromium --kiosk → http://localhost:3005
```

The dashboard is served by the `ai-monitor` Node.js server. Chromium connects to it on localhost at boot.

---

## Prerequisites

```bash
sudo apt-get install -y chromium openbox unclutter xorg xinit x11-xserver-utils
```

---

## Setup

### 1. Install the .xinitrc

```bash
cp kiosk/.xinitrc ~/
chmod +x ~/.xinitrc
```

Edit the display output name if needed:

```bash
# List available outputs
xrandr --query

# Edit ~/.xinitrc and change HDMI-A-2 to your output name
```

Common output names: `HDMI-A-1`, `HDMI-A-2`, `HDMI-1`, `DSI-1` (for official Pi display).

### 2. Install the systemd service

```bash
sudo cp kiosk/rack-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable rack-kiosk
sudo systemctl start rack-kiosk
```

Check status:
```bash
sudo systemctl status rack-kiosk
journalctl -u rack-kiosk -f
```

---

## Why Run as Root?

On Debian Bookworm, Xorg on VT1 (the physical console) requires root. The traditional `Xwrapper.config` `allowed_users = anybody` workaround no longer works on Bookworm.

The service runs as root, so Chromium requires `--no-sandbox`.

If you prefer not to run as root, look into `seatd` + `rootless Xorg` or use a lightweight Wayland compositor like `cage` instead.

---

## Dashboard Layout (1600×600)

```
┌─────────────────────┬─────────────────────────────────────────┬─────────────────────┐
│     LEFT (380px)    │           CENTRE (840px)                │     RIGHT (380px)   │
│                     │                                         │                     │
│  ● RHINO RACK       │  [Jellyfin]  [Immich]   [Portainer]    │  ┌───────────────┐  │
│                     │  [Grafana]   [n8n]      [Pihole]       │  │  RACK AI HUD  │  │
│  CPU  RAM  TEMP     │  [Homarr]    [Kuma]     [Watchtower]   │  │  Rotating     │  │
│  ███  ███  ███      │                                         │  │  rings + scan │  │
│                     │  12:34:56                               │  │  sweep        │  │
│  SD:  ██░░  42%     │  Thursday, 20 March 2026               │  └───────────────┘  │
│  SSD: ████  91%     │                                         │                     │
│                     │  Pi-hole: 1,234 blocked (18.2%)        │  > Read: server.js  │
│  ↑ 5.2 MB/s         │                                         │  > Bash: docker ps  │
│  ↓ 12.1 MB/s        │                                         │  > Edit: index.html │
│                     │                                         │  > Glob: **/*.js    │
│  Uptime: 3d 4h      │                                         │  > Write: output    │
│  ◉ Tailscale        │                                         │                     │
└─────────────────────┴─────────────────────────────────────────┴─────────────────────┘
```

---

## JARVIS HUD (Right Panel)

The 280px SVG JARVIS HUD shows:
- Concentric rotating rings (CSS animations, GPU-composited)
- Corner bracket decorations
- Animated scan sweep line
- 5 most recent AI assistant tool uses in natural language

The HUD animations speed up when an AI tool event is received via SSE from `/api/events`. This is implemented in `stacks/ai-monitor/index.html`.

### Performance on Pi

SVG `<animate>` elements cause CPU repaints. RHINO RACK uses CSS animations with `will-change: transform` and `translateZ(0)` instead, offloading to the Pi's GPU compositor. This keeps CPU usage low even with multiple animated elements.

---

## Troubleshooting

**Black screen / no display:**
```bash
sudo systemctl restart rack-kiosk
journalctl -u rack-kiosk --no-pager -n 50
```

**Wrong resolution:**
Edit `~/.xinitrc`, change the `xrandr` line to match your display. Run `xrandr --query` on the Pi to see available modes (you'll need `DISPLAY=:0 xrandr` if X is already running).

**Chromium crash loop:**
Clear the Chromium state:
```bash
rm -rf /root/.config/chromium
sudo systemctl restart rack-kiosk
```

---

## Next: [Monitoring Stack →](./05-monitoring.md)
