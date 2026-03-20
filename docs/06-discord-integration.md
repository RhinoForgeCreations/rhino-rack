# Discord Integration

RHINO RACK uses a Discord bot for two purposes:
1. **Watchtower notifications** — daily container update reports posted to #general
2. **Command approval gate** — dangerous Bash commands require your Discord approval before running

---

## Create a Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application**, give it a name (e.g., "RhinoRack Admin")
3. Go to **Bot** tab → **Add Bot**
4. Under **Token**, click **Reset Token** and copy it — this is your `DISCORD_BOT_TOKEN`
5. Enable **Message Content Intent** under Privileged Gateway Intents
6. Go to **OAuth2 → URL Generator**, select scopes: `bot`, permissions: `Send Messages`, `Read Message History`
7. Copy the generated URL, open it in browser, invite the bot to your server

---

## Get Your Channel ID

1. In Discord, go to **User Settings → Advanced** → enable **Developer Mode**
2. Right-click the channel you want to use → **Copy Channel ID**
3. This is your `DISCORD_CHANNEL_ID`

> **Note:** Make sure to use a *text channel* ID, not a category ID. They look similar but categories don't accept messages.

---

## Watchtower Notifications

The `watchtower` stack sends update reports to the AI Monitor's `/api/watchtower-notify` endpoint, which relays them to Discord.

Set in `stacks/watchtower/.env`:
```
PI_IP=192.168.1.xxx
```

Set in `stacks/ai-monitor/.env`:
```
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
```

The relay is implemented in `server.js`:
```
Watchtower → POST /api/watchtower-notify → Discord API → #general
```

---

## Approval Gate Hook

The approval gate (`hooks/discord-approve.sh`) intercepts dangerous Bash commands run by the AI assistant and requires your explicit Discord approval before proceeding.

### How it works

1. You (or the AI) issues a command like `rm -rf /old-data`
2. The hook detects it as dangerous
3. A plain-English message appears in your Discord channel:
   ```
   Hey, RACK AI here. I need your go-ahead before running a command on RHINO RACK.

   Command I want to run:
   rm -rf /old-data

   Reply with approve to let me continue, or deny to stop it. I will wait up to 5 minutes.
   ```
4. You reply `approve` (or `yes`, `ok`, `allow`) to proceed, or `deny` (or `no`, `stop`, `cancel`) to block
5. The hook confirms the decision in Discord and exits accordingly

### Dangerous patterns intercepted

| Pattern | Examples |
|---------|---------|
| `rm` with `-r` or `-f` flags | `rm -rf /path`, `rm -fr` |
| `dd` writing to devices | `dd if=... of=/dev/sda` |
| Filesystem tools | `mkfs`, `wipefs`, `shred`, `mke2fs`, `mkswap` |
| Partition tools | `fdisk`, `parted`, `gdisk`, `sfdisk` |
| Destructive git commands | `git reset --hard`, `git push --force`, `git clean -f` |
| Docker cleanup | `docker system prune`, `docker volume prune`, `docker image prune` |
| Container removal with volumes | `docker compose down -v` |
| Truncate to zero | `truncate -s 0 file` |
| Writes to system dirs | `> /etc/...`, `> /boot/...`, `> /opt/...` |

### Setup

1. Copy the hook and set your credentials:
   ```bash
   cp hooks/discord-approve.sh ~/.claude/hooks/
   chmod +x ~/.claude/hooks/discord-approve.sh
   ```

2. Create `~/.claude/hooks/.env`:
   ```bash
   DISCORD_BOT_TOKEN=your_bot_token_here
   DISCORD_CHANNEL_ID=your_channel_id_here
   ```

3. Register the hook in `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [{
             "type": "command",
             "command": "/home/YOUR_USER/.claude/hooks/discord-approve.sh"
           }]
         }
       ]
     }
   }
   ```

See [AI Integration →](./07-ai-integration.md) for the full hooks configuration.

---

## Troubleshooting

**Bot returns 403 / Cloudflare error:**
Always set the `User-Agent` header:
```
User-Agent: DiscordBot (https://github.com/discord/discord-api-docs, 10)
```
`urllib` and some curl invocations without User-Agent will get blocked. The scripts in this repo already set this header.

**Messages go to wrong channel:**
Ensure you copied a *text channel* ID (not a category). Categories have the same format but cannot receive messages.

---

## Next: [AI Integration →](./07-ai-integration.md)
