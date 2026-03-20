# Kiosk Setup

Launches the RHINO RACK dashboard in Chromium kiosk mode on a 1600×600 HDMI display at boot.

## Prerequisites

```bash
sudo apt-get install -y chromium openbox unclutter xorg xinit x11-xserver-utils
```

## Install

```bash
# Copy .xinitrc to home directory
cp kiosk/.xinitrc ~/
chmod +x ~/.xinitrc

# Edit the service file — replace YOUR_USER with your username
sed -i "s/YOUR_USER/$USER/g" kiosk/rack-kiosk.service

# Install service
sudo cp kiosk/rack-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rack-kiosk
```

## Adjusting the display

Edit `~/.xinitrc` and change the `xrandr` output name to match your hardware.
Run `xrandr --query` to list available outputs.

Common names: `HDMI-A-1`, `HDMI-A-2`, `HDMI-1`, `DSI-1`

If your display doesn't support `1600x600`, add a custom mode:

```bash
# Calculate modeline with cvt
cvt 1600 600 60

# Add the mode to xrandr in .xinitrc:
xrandr --newmode "1600x600_60.00" ... (output from cvt)
xrandr --addmode HDMI-A-1 1600x600_60.00
xrandr --output HDMI-A-1 --mode 1600x600_60.00
```

## Checking status

```bash
sudo systemctl status rack-kiosk
journalctl -u rack-kiosk -f
```
