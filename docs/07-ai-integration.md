# AI Assistant Integration

RHINO RACK integrates with [Claude Code](https://claude.ai/code) (Anthropic's AI coding assistant CLI) to provide:

- **Live activity logging** — every tool use (file reads, edits, bash commands, searches) is logged to a JSON file
- **Real-time dashboard feed** — the kiosk's JARVIS HUD displays the last 5 actions in natural language
- **Discord approval gate** — dangerous Bash commands require Discord `approve` / `deny` before running

This transforms the kiosk into a live "mission control" display — you can see what the AI is doing on your server in real time.

---

## How It Works

```
Claude Code
  │
  ├── PreToolUse hook → discord-approve.sh   (Bash only, blocks if dangerous)
  ├── PreToolUse hook → hook-logger.sh        (all tools → activity.log)
  └── PostToolUse hook → hook-logger.sh       (all tools → activity.log)

activity.log
  └── watched by server.js (fs.watchFile)
        └── new lines → SSE broadcast → /api/events
              └── index.html (EventSource)
                    └── JARVIS HUD → shows last 5 actions
```

---

## Activity Log Format

Each line in `activity.log` is a JSON object:

```json
{
  "ts": "2026-03-20T12:34:56.789Z",
  "type": "PreToolUse",
  "tool": "Bash",
  "preview": "docker ps --format '{{.Names}}|{{.Status}}'",
  "result": ""
}
```

```json
{
  "ts": "2026-03-20T12:34:57.012Z",
  "type": "PostToolUse",
  "tool": "Read",
  "preview": "/opt/stacks/ai-monitor/server.js",
  "result": "const http = require('http')..."
}
```

---

## Setup

### 1. Deploy the AI Monitor

```bash
cd /opt/stacks/ai-monitor
cp .env.example .env    # fill in your Pi-hole and Discord credentials
sudo cp ai-monitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ai-monitor
```

### 2. Install the hooks

```bash
mkdir -p ~/.claude/hooks
cp hooks/hook-logger.sh ~/.claude/hooks/
cp hooks/discord-approve.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.sh
```

### 3. Configure Claude Code settings

Edit `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(*)", "Read(*)", "Write(*)", "Edit(*)",
      "Glob(*)", "Grep(*)", "WebFetch(*)", "WebSearch(*)", "Agent(*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "/home/YOUR_USER/.claude/hooks/discord-approve.sh"
        }]
      },
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "HOOK_TYPE=PreToolUse /opt/stacks/ai-monitor/hook-logger.sh"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "HOOK_TYPE=PostToolUse /opt/stacks/ai-monitor/hook-logger.sh"
        }]
      }
    ]
  }
}
```

Replace `YOUR_USER` with your username.

---

## JARVIS HUD

The right panel of the kiosk dashboard is a 280×560px SVG "JARVIS HUD" that:

- Shows three concentric rotating rings (outer: slow/clockwise, mid: medium/counter-clockwise, inner: fast/clockwise)
- Animated scanning sweep line that continuously rotates
- Corner bracket decorations
- Displays the last 5 tool events in natural language below the SVG

When a PreToolUse event arrives via SSE, the animation duration shortens (speeds up) for 3 seconds, then returns to normal. This gives a live visual indication that the AI is actively working.

### Animation performance

All animations use CSS `animation` with `will-change: transform` and `translateZ(0)` to force GPU compositing on the Pi's VideoCore. This avoids the CPU repaints caused by SVG `<animate>` elements.

---

## SSE Events API

The AI Monitor broadcasts events to connected clients via Server-Sent Events at `/api/events`.

| Event | Data | Description |
|-------|------|-------------|
| `history` | `[...events]` | Last 30 events, sent on connect |
| `activity` | `{ts, type, tool, preview, result}` | New event from activity log |
| `: ping` | — | Keepalive every 15s |

The dashboard connects using the browser's native `EventSource` API.

---

## Disabling the Approval Gate

If you want activity logging without the approval gate, simply remove the `discord-approve.sh` hook from `settings.json`. The `hook-logger.sh` hook is independent and will continue working.

---

## Installing Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude
```

Claude Code requires an Anthropic API key. Set it:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

See [Claude Code documentation](https://docs.anthropic.com/claude-code) for full setup.
