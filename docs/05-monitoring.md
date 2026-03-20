# Monitoring Stack

RHINO RACK uses a three-tier monitoring approach:

1. **Node Exporter** — collects raw system metrics from `/proc` and `/sys`
2. **Prometheus** — scrapes and stores metrics (30-day retention)
3. **Grafana** — visualises metrics in dashboards

Plus a custom **AI Monitor** Node.js server that provides additional stats (SMART, Pi-hole, Docker, live activity) to the kiosk dashboard.

---

## Deploy

```bash
cd /opt/stacks/monitoring
cp .env.example .env
# Edit .env and set PI_IP to your Pi's IP address
docker compose up -d
```

---

## Prometheus

- Runs at `http://<pi-ip>:9090`
- Scrapes Node Exporter at `<pi-ip>:9100` every 15 seconds
- 30-day data retention

**prometheus.yml** uses `${PI_IP}` for the scrape target. This is set in the `.env` file and substituted by Docker Compose.

---

## Node Exporter

Runs in host network mode (`network_mode: host`) so it can read `/proc`, `/sys`, and network interface stats directly from the Pi. It does not need a port mapping — it binds to `0.0.0.0:9100` automatically.

The `--collector.filesystem.mount-points-exclude` flag prevents it from trying to scrape Docker overlay filesystems, which would generate noise.

---

## Grafana

- Runs at `http://<pi-ip>:3000`
- Default login: `admin` / `changeme` — **change this immediately**

### Setting up the Prometheus datasource

1. Go to **Configuration → Data Sources → Add data source**
2. Select **Prometheus**
3. URL: `http://prometheus:9090` (Docker internal DNS)
4. Click **Save & Test**

### Importing dashboards

**Node Exporter Full** (comprehensive system metrics):
1. **Dashboards → Import**
2. Enter ID `1860` and click **Load**
3. Select the Prometheus datasource and import

**RHINO RACK Overview** (custom summary dashboard):
Coming soon — export JSON will be added to `stacks/monitoring/dashboards/`.

### Set a dashboard as home

1. Open the dashboard
2. Click the star icon (Mark as favourite)
3. Go to **Configuration → Preferences → Home Dashboard** and select it

---

## Custom CPU Smoothing

OMV runs `omv-mkrrdgraph` every 15 minutes, spiking one CPU core to ~80% for a few seconds. This is visible in raw Prometheus data but irrelevant to true system load.

The AI Monitor's `server.js` handles this at the source using a 5-sample rolling average from `/proc/stat` with a ~15s window. Real idle load on this Pi is ~50–60%.

---

## SMART Drive Monitoring

SMART data is collected in `server.js` (not Prometheus) and displayed directly on the kiosk dashboard. Fields shown:

| Field | Description |
|-------|-------------|
| `tempC` | Drive temperature in °C |
| `spareAvail` | Available spare blocks (%) |
| `wearPct` | Percentage of drive lifespan used |
| `mediaErrors` | Media and data integrity errors |
| `unsafeShutdowns` | Unclean power-off events |

The sudoers rule added in [OS Setup](./02-os-and-omv.md) allows `server.js` to call `smartctl` without a password prompt.

---

## Next: [Discord Integration →](./06-discord-integration.md)
