# Hardware Setup

## Components

### Server
**Raspberry Pi 4B (8GB)**
The heart of the build. 8GB RAM is recommended for running 14+ containers comfortably. The Pi draws ~5–7W at idle — an always-on server that barely shows up on your power bill.

### Rack
**KWS Rack v.2** — [MakerWorld](https://makerworld.com/en/models/2139130-kws-rack-v-2-heavy-duty-10-inch-homelab-rack) (Heavy Duty 10" Homelab Rack)

A compact, 3D-printed desktop rack designed to house a Raspberry Pi along with drives, switches, and accessories in a proper rack form factor. This gives RHINO RACK a professional, lab-grade aesthetic on your desk without the footprint of a full 19" rack.

The KWS Rack v.2 accommodates:
- Raspberry Pi 4B (mounted with standoffs)
- 2.5" SSDs or HDDs in drive bays
- Small networking gear (switch, patch panel)
- Cable management built into the frame

If you're replicating this project, the KWS Rack v.2 from MakerWorld is highly recommended — it makes the build look intentional rather than a pile of cables and breadboards.

### Storage

| Drive | Interface | Capacity | Filesystem | Mount |
|-------|-----------|----------|------------|-------|
| MicroSD (Samsung Endurance) | SDIO | 64GB | ext4 | `/` (root) |
| Samsung Portable SSD T7 | USB 3.2 Gen 2 | 1TB | exFAT | `/mnt/ssd` |

**Why exFAT for the SSD?** Cross-platform compatibility — exFAT can be read/written by Linux, macOS, and Windows without drivers, making it easy to pull data off the drive if the Pi ever dies.

**SD card wear:** OMV and Docker keep most writes off the SD card. Log rotation is configured to reduce wear. The SD card is purely for the OS; all data lives on the SSD.

### Display
A **1600×600** HDMI panel mounted in the rack face. This unusual resolution gives a wide, short ticker-style display perfect for a dashboard. Any 16:x widescreen panel works — just adjust the resolution in `.xinitrc` if yours differs.

### Network
- **Ethernet (end0)** — Gigabit, primary connection
- **Tailscale** — WireGuard-based VPN mesh, the only external exposure. No port forwarding, no exposed public IP.

---

## Physical Assembly

1. Mount the Pi in the KWS Rack v.2 using M2.5 standoffs
2. Connect the SSD via USB 3.0 (blue port) for maximum throughput
3. Run the HDMI cable to your display panel
4. Route Ethernet from your router/switch to the Pi
5. Power via official Pi 4 USB-C PSU (5V 3A minimum)

---

## SMART Monitoring

The Samsung T7 NVMe-in-USB controller exposes SMART data via `smartctl`:

```bash
sudo smartctl -A /dev/sda
```

RHINO RACK parses these fields automatically in the dashboard:
- **Temperature** — `Temperature_Celsius`
- **Wear level** — `Percentage Used`
- **Spare capacity** — `Available Spare`
- **Media errors** — `Media and Data Integrity Errors`
- **Unsafe shutdowns** — `Unsafe Shutdowns` (power loss events)

To enable non-root SMART access, add a sudoers rule:

```bash
echo "YOUR_USER ALL=(ALL) NOPASSWD: /usr/sbin/smartctl -A /dev/*" \
  | sudo tee /etc/sudoers.d/smartctl-readonly
```

---

## Next: [OS & OMV Setup →](./02-os-and-omv.md)
