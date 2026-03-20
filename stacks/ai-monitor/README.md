# AI Monitor

A lightweight Node.js server that powers the RHINO RACK kiosk dashboard. It collects live system stats, streams AI assistant activity via SSE, and relays Watchtower notifications to Discord.

## What it does

- **`/`** — Serves the kiosk dashboard HTML (1600×600, three-panel layout)
- **`/api/stats`** — Returns a JSON snapshot of CPU, RAM, temp, storage, network, Docker containers, Tailscale status, Pi-hole stats, and SMART data
- **`/api/activity`** — Returns recent AI activity log entries
- **`/api/events`** — SSE stream, broadcasts new activity log entries in real time
- **`/api/watchtower-notify`** — POST endpoint; receives Watchtower webhook and forwards to Discord

## Setup

```bash
cp .env.example .env
# Edit .env with your credentials

# Install as a systemd service
sed -i 's/YOUR_USER/'"$USER"'/g' ai-monitor.service
sudo cp ai-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-monitor
```

## Requirements

- Node.js 18+ (no npm packages required — only built-in modules)
- `docker` accessible to the service user
- `smartctl` accessible via sudoers rule (see [OS Setup docs](../../docs/02-os-and-omv.md))
- `tailscale` installed if you want Tailscale status

## Environment Variables

See `.env.example` for all variables. At minimum, no variables are required — the server starts without Pi-hole or Discord integration, they are both optional.

## CPU Smoothing

The server uses a 5-sample rolling average from `/proc/stat` (sampled on each `/api/stats` request, ~15s window at 3s poll). This smooths out the periodic `omv-mkrrdgraph` spike that would otherwise show false 80% CPU readings every 15 minutes.
