# Docker Setup

## Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Verify:
```bash
docker run --rm hello-world
```

---

## Stack Directory Structure

All stacks live under `/opt/stacks/`. Create the base directory:

```bash
sudo mkdir -p /opt/stacks
sudo chown $USER:$USER /opt/stacks
```

Clone this repo and copy stacks:

```bash
git clone https://github.com/YOUR_USERNAME/rhino-rack.git ~/rhino-rack
```

For each stack you want to run:

```bash
sudo cp -r ~/rhino-rack/stacks/STACK_NAME /opt/stacks/
cd /opt/stacks/STACK_NAME
cp .env.example .env    # then edit .env with your values
docker compose up -d
```

---

## Port Map

| Service | Port | Notes |
|---------|------|-------|
| AI Monitor | 3005 | Dashboard + API + SSE |
| Grafana | 3000 | Monitoring dashboards |
| Prometheus | 9090 | Metrics database |
| Node Exporter | 9100 | System metrics (host network) |
| n8n | 5678 | Workflow automation |
| Jellyfin | 8096 | Media streaming |
| Immich | 2283 | Photo management |
| Pi-hole | 8053 / 53 | DNS + web UI (host network) |
| Homarr | 7575 | Home dashboard |
| Uptime Kuma | 3001 | Uptime monitoring |
| Portainer | 9000 | Docker management UI |

---

## Deployment Order

Some stacks depend on others. Recommended order:

1. `monitoring` (Prometheus, Node Exporter, Grafana)
2. `ai-monitor` (needs to be up before kiosk)
3. `pihole` (DNS — deploy early so other containers resolve correctly)
4. All others in any order

---

## Managing Stacks

```bash
# Start a stack
docker compose -f /opt/stacks/STACK/compose.yml up -d

# Stop a stack
docker compose -f /opt/stacks/STACK/compose.yml down

# View logs
docker compose -f /opt/stacks/STACK/compose.yml logs -f

# Update a stack
docker compose -f /opt/stacks/STACK/compose.yml pull
docker compose -f /opt/stacks/STACK/compose.yml up -d
```

Or use **Portainer** (port 9000) for a web UI.

---

## Watchtower — Automatic Updates

The `watchtower` stack automatically updates all containers nightly at 4am and cleans up old images. See [stacks/watchtower/](../stacks/watchtower/) for configuration.

---

## Homarr Fix

Homarr (Next.js) binds to the container's internal IP by default, making it unreachable from the host. Fix:

```yaml
environment:
  HOSTNAME: "0.0.0.0"
```

This is already included in the `compose.yml` in this repo.

---

## Next: [Kiosk Dashboard →](./04-kiosk-dashboard.md)
