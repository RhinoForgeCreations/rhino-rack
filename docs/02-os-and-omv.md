# OS & OpenMediaVault Setup

## Base OS

**Debian Bookworm (64-bit)** via Raspberry Pi OS Lite (64-bit).

Download the latest Raspberry Pi OS Lite (64-bit) from [raspberrypi.com/software](https://www.raspberrypi.com/software/) and flash it with Raspberry Pi Imager. Enable SSH and set your hostname/user in the imager's advanced options before flashing.

### First boot config

```bash
# Update the system
sudo apt-get update && sudo apt-get upgrade -y

# Set hostname
sudo hostnamectl set-hostname pinas

# Set timezone
sudo timedatectl set-timezone Australia/Melbourne
```

---

## OpenMediaVault

OpenMediaVault (OMV) turns the Pi into a proper NAS with a web UI for disk management, SMB/NFS shares, and more.

### Install OMV

```bash
wget -O - https://github.com/OpenMediaVault-Plugin-Developers/installScript/raw/master/install | sudo bash
```

This takes ~10–15 minutes. The Pi will reboot automatically.

### Access OMV

Navigate to `http://<pi-ip>` in your browser. Default credentials: `admin` / `openmediavault`.

Change the admin password immediately: **System → General Settings → Web Administrator Password**.

### Mount the SSD

1. Go to **Storage → Disks** and confirm the SSD appears (e.g., `/dev/sda`)
2. Go to **Storage → File Systems**, click **+**, select the SSD, mount it
3. Under **Storage → Shared Folders**, create a folder pointing to the SSD mount
4. Enable SMB/NFS under **Services** if you need network shares

The SSD will mount at `/srv/dev-disk-by-uuid-XXXX/` via OMV, but for Docker stacks it's cleaner to also add a manual `/etc/fstab` entry:

```bash
# Find the UUID
sudo blkid /dev/sda1

# Add to /etc/fstab
UUID=YOUR-UUID  /mnt/ssd  exfat  defaults,nofail,uid=1000,gid=1000  0  2
```

Then:
```bash
sudo mkdir -p /mnt/ssd
sudo mount -a
```

---

## OMV CPU Spike Behaviour

OMV runs `omv-mkrrdgraph` every 15 minutes to generate system graphs. This spikes one CPU core to ~80% for a few seconds. This is normal.

RHINO RACK's `server.js` uses a 5-sample rolling average (~15s window) from `/proc/stat` to smooth this out, so the dashboard shows realistic idle load (~50–60%) rather than alarming spikes.

The cron is at `/etc/cron.d/openmediavault-mkrrdgraph`. You can inspect it but do not remove it — OMV depends on it.

---

## Tailscale (Remote Access)

Tailscale provides secure remote access via WireGuard without port forwarding. It's free on personal accounts.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

All services are accessible remotely via your Tailscale IP — no exposed ports, no public IP.

---

## Sudoers for SMART

Allow the service user to read SMART data without a password:

```bash
echo "rhino_pi_nas ALL=(ALL) NOPASSWD: /usr/sbin/smartctl -A /dev/*" \
  | sudo tee /etc/sudoers.d/smartctl-readonly
sudo chmod 440 /etc/sudoers.d/smartctl-readonly
```

Replace `rhino_pi_nas` with your username.

---

## Next: [Docker Setup →](./03-docker-setup.md)
