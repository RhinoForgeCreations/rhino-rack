#!/bin/bash
# Rack dashboard kiosk startup
# Launched by xinit from rack-kiosk.service

xset s off         # Disable screensaver
xset -dpms         # Disable power management (prevents display sleep)
xset s noblank     # No screen blank

# Set display resolution — adjust output name for your hardware
# Run 'xrandr --query' to see available outputs and modes
xrandr --output HDMI-A-2 --mode 1600x600 --primary 2>/dev/null || \
  xrandr --output HDMI-A-1 --mode 1600x600 --primary 2>/dev/null || \
  xrandr --output HDMI-1 --mode 1600x600 --primary 2>/dev/null || true

# Hide mouse cursor after 0 seconds idle
unclutter -idle 0 &

# Minimal window manager (required for chromium kiosk)
openbox &

sleep 2

# Launch Chromium in kiosk mode
# --no-sandbox is required when running as root (rack-kiosk.service runs as root)
chromium --kiosk \
  --no-sandbox \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --no-first-run \
  --window-size=1600,600 \
  --window-position=0,0 \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  http://localhost:3005
