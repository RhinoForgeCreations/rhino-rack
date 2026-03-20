# RHINO RACK

> Self-hosted homelab NAS and media server built on a Raspberry Pi 4B, rack-mounted in a [KWS Rack v.2 by Makerlab](https://makerlab.com.au), running a full Docker stack with a custom kiosk dashboard, real-time system monitoring, and AI assistant integration.

---

## Overview

RHINO RACK is a full-featured homelab server project combining:

- **Raspberry Pi 4B** as the server, mounted in a **KWS Rack v.2** 3D-printed desktop rack from [Makerlab](https://makerlab.com.au)
- **OpenMediaVault** for NAS management and storage administration
- **14 Docker containers** across 9 stacks (media, monitoring, automation, networking)
- A **custom 1600×600 kiosk dashboard** displayed on a dedicated HDMI screen
- **Real-time system monitoring** with Prometheus + Grafana + a custom Node.js stats server
- **Discord bot integration** for notifications and a remote approval gate for dangerous commands
- **AI assistant hooks** — live activity feed, animated JARVIS HUD, and Discord-based command authorization

---

## Hardware

| Component | Details |
|-----------|---------|
| **Server** | Raspberry Pi 4B (8GB RAM) |
| **Rack** | [KWS Rack v.2 — Makerlab](https://makerlab.com.au) (3D-printed desktop rack) |
| **Storage** | Samsung Portable SSD T7 1TB (USB 3.2, exFAT) |
| **OS Drive** | MicroSD 64GB (Debian Bookworm root) |
| **Display** | 1600×600 HDMI panel (kiosk mode) |
| **Network** | Ethernet (Gigabit), Tailscale VPN for remote access |

The KWS Rack v.2 is a compact 3D-printed desktop server rack from Makerlab that neatly houses the Pi, drives, and accessories in a professional rack form factor — perfect for a homelab build.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         RHINO RACK                              │
│                    Raspberry Pi 4B + OMV                        │
├──────────────┬──────────────────────────┬───────────────────────┤
│  MEDIA       │  MONITORING              │  NETWORKING           │
│  ─────────── │  ──────────────────────  │  ─────────────────── │
│  Jellyfin    │  Prometheus :9090        │  Pi-hole (DNS)        │
│  Immich      │  Node Exporter :9100     │  Tailscale VPN        │
│              │  Grafana :3000           │                       │
├──────────────┼──────────────────────────┼───────────────────────┤
│  MANAGEMENT  │  AUTOMATION              │  AI INTEGRATION       │
│  ─────────── │  ──────────────────────  │  ─────────────────── │
│  Portainer   │  n8n :5678               │  AI Monitor :3005     │
│  Homarr      │  Watchtower (auto-upd.)  │  Kiosk Dashboard      │
│  Uptime Kuma │                          │  Discord Approval     │
└──────────────┴──────────────────────────┴───────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   1600×600 HDMI   │
                    │  Kiosk Dashboard  │
                    │  ───────────────  │
                    │  Left: Gauges     │
                    │  Centre: Docker   │
                    │  Right: JARVIS    │
                    └───────────────────┘
```

---

## Features

### Custom Kiosk Dashboard
- Fixed 1600×600 layout across 3 panels, runs fullscreen in Chromium kiosk mode on VT1
- **Left panel:** Live CPU/RAM/Temp SVG gauges, storage bars with SMART data inline, network RX/TX, uptime, Tailscale status
- **Centre panel:** Docker container tiles with status indicators, digital clock, Pi-hole query stats
- **Right panel:** Animated RACK AI JARVIS HUD — rotating rings, scan sweep, corner brackets, 5 natural-language status messages
- HUD animations accelerate on AI tool execution events (via hooks)
- GPU-composited with `will-change: transform` + `translateZ(0)` for smooth 60fps on Pi hardware

### System Monitoring
- Prometheus scrapes Node Exporter every 15s (30-day retention)
- Grafana dashboards: "RHINO RACK Overview" (custom) + "Node Exporter Full"
- Custom CPU smoothing: 5-sample rolling average (~15s window) to mask OMV's `omv-mkrrdgraph` cron spikes
- SMART data parsed directly from `smartctl` — temperature, wear %, spare capacity, media errors, unsafe shutdowns

### Docker Automation
- Watchtower scans all containers nightly (4am), auto-cleans old images
- Update reports forwarded from the AI Monitor webhook relay to Discord

### Discord Integration
- Bot posts Watchtower update reports to your server's #general channel
- **Approval gate hook:** intercepts dangerous Bash commands (`rm -rf`, `dd`, `mkfs`, `fdisk`, `git reset --hard`, `docker prune`, etc.), sends a plain-English message to Discord, and waits up to 5 minutes for your `approve` / `deny` reply before proceeding

### AI Assistant Integration
- Claude Code hook system logs every tool execution (PreToolUse / PostToolUse) to a JSON activity log
- SSE stream broadcasts live events to the dashboard
- JARVIS HUD speeds up on AI activity, displays the last 5 actions in natural language

### Media & Photo Management
- **Jellyfin** — self-hosted media server for movies and TV
- **Immich** — self-hosted Google Photos alternative (machine learning face/object recognition)

### Network
- **Pi-hole** — LAN-wide DNS ad-blocking with TOTP-authenticated API integration
- **Tailscale** — WireGuard-based VPN, the only external exposure (no port forwarding)

---

## Stack Index

| Stack | Port | Description |
|-------|------|-------------|
| [ai-monitor](./stacks/ai-monitor/) | 3005 | Custom Node.js stats + AI activity dashboard |
| [monitoring](./stacks/monitoring/) | 9090 / 3000 | Prometheus + Node Exporter + Grafana |
| [n8n](./stacks/n8n/) | 5678 | Workflow automation |
| [watchtower](./stacks/watchtower/) | — | Automatic container updates |
| [jellyfin](./stacks/jellyfin/) | 8096 | Media server |
| [immich](./stacks/immich/) | 2283 | Photo backup & management |
| [pihole](./stacks/pihole/) | 8053 | DNS ad-blocker |
| [homarr](./stacks/homarr/) | 7575 | Home dashboard / app launcher |
| [uptime-kuma](./stacks/uptime-kuma/) | 3001 | Service uptime monitoring |

---

## Quick Start

### Prerequisites

- Raspberry Pi 4B (4GB+ RAM recommended) running Debian Bookworm
- Docker + Docker Compose installed
- OpenMediaVault (optional, for NAS features)
- A Discord bot token (for notifications + approval gate)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/rhino-rack.git
cd rhino-rack
```

### 2. Deploy a stack

Each stack has its own directory. To start one:

```bash
cd stacks/monitoring
cp .env.example .env      # fill in your values
docker compose up -d
```

### 3. Set up the AI Monitor

```bash
cd stacks/ai-monitor
cp .env.example .env       # fill in Pi-hole credentials and Discord token
npm install                # (only needs built-in Node.js modules, no install needed)
sudo cp ai-monitor.service /etc/systemd/system/
sudo systemctl enable --now ai-monitor
```

### 4. Set up the kiosk display

```bash
sudo apt-get install -y chromium openbox unclutter xorg xinit
cp kiosk/.xinitrc ~/
sudo cp kiosk/rack-kiosk.service /etc/systemd/system/
sudo systemctl enable --now rack-kiosk
```

### 5. Set up Discord hooks (optional)

```bash
cp hooks/.env.example hooks/.env    # fill in your bot token and channel ID
# Add to your Claude Code settings.json:
# See hooks/README.md for full setup
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Hardware Setup](./docs/01-hardware.md) | Pi, KWS Rack v.2, storage, display wiring |
| [OS & OMV Setup](./docs/02-os-and-omv.md) | Debian Bookworm, OpenMediaVault, SSD mounting |
| [Docker Setup](./docs/03-docker-setup.md) | Docker install, stack deployment, port map |
| [Kiosk Dashboard](./docs/04-kiosk-dashboard.md) | Chromium kiosk, systemd service, display config |
| [Monitoring Stack](./docs/05-monitoring.md) | Prometheus, Node Exporter, Grafana dashboards |
| [Discord Integration](./docs/06-discord-integration.md) | Bot setup, Watchtower relay, approval hook |
| [AI Integration](./docs/07-ai-integration.md) | Claude Code hooks, activity log, JARVIS HUD |

---

## Project Structure

```
rhino-rack/
├── README.md
├── docs/                    # Step-by-step setup guides
├── stacks/
│   ├── ai-monitor/          # Custom stats server + kiosk dashboard UI
│   ├── monitoring/          # Prometheus + Grafana + Node Exporter
│   ├── watchtower/          # Automatic container updates
│   ├── n8n/                 # Workflow automation
│   ├── jellyfin/            # Media server
│   ├── immich/              # Photo management
│   ├── pihole/              # DNS ad-blocking
│   ├── homarr/              # Home dashboard
│   └── uptime-kuma/         # Uptime monitoring
├── kiosk/                   # Kiosk mode setup (systemd + .xinitrc)
└── hooks/                   # Discord approval gate + activity logger
```

---

## Skills Demonstrated

This project covers a broad range of infrastructure and software engineering skills:

- **Linux administration** — Debian, systemd services, cron, sudoers, kernel interfaces (`/proc/stat`, `/sys`)
- **Docker & Docker Compose** — multi-service stacks, networking, volume management, health checks
- **Node.js backend** — HTTP server, SSE (Server-Sent Events), file watching, system metrics parsing
- **Frontend** — Vanilla JS dashboard, SVG animations, CSS GPU compositing, real-time data binding
- **Monitoring** — Prometheus metrics, Grafana dashboards, SMART drive health, custom alerting
- **Automation** — n8n workflows, Watchtower, webhook relay pipelines
- **Security** — Tailscale VPN, Pi-hole DNS filtering, Discord approval gate for destructive commands
- **AI tooling** — Claude Code hook system, live activity streaming, approval workflows

---

## License

MIT
