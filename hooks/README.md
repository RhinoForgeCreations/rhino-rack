# Claude Code Hooks

These hooks integrate with [Claude Code](https://docs.anthropic.com/claude-code) to add activity logging and a Discord-based approval gate.

## Files

| File | Purpose |
|------|---------|
| `discord-approve.sh` | Intercepts dangerous Bash commands, requires Discord approval |
| `hook-logger.sh` (in `stacks/ai-monitor/`) | Logs all tool events to `activity.log` |

## Setup

### 1. Set environment variables

Create `~/.claude/hooks/.env` (or export these in your shell):

```bash
export DISCORD_BOT_TOKEN=your_bot_token_here
export DISCORD_CHANNEL_ID=your_channel_id_here
```

### 2. Install hooks

```bash
mkdir -p ~/.claude/hooks
cp hooks/discord-approve.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/discord-approve.sh

# Make hook-logger.sh executable
chmod +x /opt/stacks/ai-monitor/hook-logger.sh
```

### 3. Configure Claude Code settings

Edit `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "source ~/.claude/hooks/.env && /home/YOUR_USER/.claude/hooks/discord-approve.sh"
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

## Dangerous Patterns Intercepted

The approval gate blocks commands matching:

- `rm` with `-r` or `-f` flags
- `dd` writing to block devices
- `mkfs`, `wipefs`, `shred`, `mke2fs`, `mkswap`
- `fdisk`, `parted`, `gdisk`, `sgdisk`, `sfdisk`
- `git reset --hard`, `git push --force`, `git clean -f`
- `docker system prune`, `docker volume prune`, `docker image prune`
- `docker compose down -v`
- `truncate -s 0`
- Redirects writing to `/etc`, `/boot`, `/home`, `/opt`, `/var`, `/usr`

All other commands pass through without prompting.

## Approval Words

**Allow:** `approve`, `yes`, `y`, `ok`, `allow`, `approved`, `go`

**Block:** `deny`, `no`, `n`, `block`, `cancel`, `denied`, `stop`, `nope`

Emojis and punctuation are stripped — `Approve 👍` and `approve` both work.
