#!/bin/bash
# RACK AI — Discord approval gate for dangerous Bash commands
# Part of the Claude Code hook system.
#
# Intercepts dangerous commands, sends a plain-English message to your Discord
# channel, and waits up to 5 minutes for 'approve' or 'deny'.
#
# Exit 0 = allow the command
# Exit 2 = block the command
#
# Usage: register as a PreToolUse hook for Bash in ~/.claude/settings.json
# See docs/07-ai-integration.md for full setup instructions.

# --- Credentials ---
# Set these in your environment or source a .env file
BOT_TOKEN="${DISCORD_BOT_TOKEN}"
CHANNEL_ID="${DISCORD_CHANNEL_ID}"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHANNEL_ID" ]; then
    echo "Warning: DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID not set. Approval gate disabled." >&2
    exit 0
fi

TIMEOUT_SECS=300   # 5 minutes
UA="DiscordBot (https://github.com/discord/discord-api-docs, 10)"

# --- Read hook input ---
INPUT=$(cat)
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only intercept Bash commands
[ "$TOOL" != "Bash" ] && exit 0

# --- Dangerous pattern detection ---
is_dangerous() {
  local c="$1"
  echo "$c" | grep -qE '\brm\b.{0,40}-[a-zA-Z]*[rf]'          && return 0
  echo "$c" | grep -qE '\bdd\b.*\bof='                          && return 0
  echo "$c" | grep -qE '\b(mkfs|wipefs|shred|mke2fs|mkswap)\b' && return 0
  echo "$c" | grep -qE '\b(fdisk|parted|gdisk|sgdisk|sfdisk)\b' && return 0
  echo "$c" | grep -qE '\bgit\b.*(reset\s+--hard|push\s+.*--force|push\s+-f\b|clean\s+-f\b)' && return 0
  echo "$c" | grep -qE '\bdocker\b.*(system\s+prune|volume\s+prune|image\s+prune)' && return 0
  echo "$c" | grep -qE '\bdocker(\s+compose)?\b.*\s-v\b'        && return 0
  echo "$c" | grep -qE '\btruncate\b.*-s\s*0\b'                 && return 0
  echo "$c" | grep -qE '>\s*/(etc|boot|home|opt|var|usr)/'      && return 0
  return 1
}

is_dangerous "$CMD" || exit 0

# --- Build the message ---
SHORT_CMD="${CMD:0:500}"
MSG_CONTENT="Hey, RACK AI here. I need your go-ahead before running a command on RHINO RACK.

Command I want to run:

$SHORT_CMD

Reply with approve to let me continue, or deny to stop it. I will wait up to 5 minutes."

# --- Send to Discord ---
SEND_RESPONSE=$(curl -s -X POST \
  "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bot $BOT_TOKEN" \
  -H "User-Agent: $UA" \
  -H "Content-Type: application/json" \
  --data-binary "$(python3 -c "import json,os; print(json.dumps({'content': open('/dev/stdin').read()}))" <<< "$MSG_CONTENT")")

MSG_ID=$(echo "$SEND_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

if [ -z "$MSG_ID" ]; then
    echo "Could not send Discord message (response: $SEND_RESPONSE). Blocking command for safety." >&2
    exit 2
fi

discord_send() {
  local text="$1"
  curl -s -X POST \
    "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
    -H "Authorization: Bot $BOT_TOKEN" \
    -H "User-Agent: $UA" \
    -H "Content-Type: application/json" \
    --data-binary "$(python3 -c "import json,sys; print(json.dumps({'content': sys.stdin.read()}))" <<< "$text")" \
    > /dev/null 2>&1
}

# --- Poll for approval ---
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT_SECS" ]; do
    sleep 3
    ELAPSED=$((ELAPSED + 3))

    MSGS=$(curl -s \
      "https://discord.com/api/v10/channels/$CHANNEL_ID/messages?after=$MSG_ID&limit=10" \
      -H "Authorization: Bot $BOT_TOKEN" \
      -H "User-Agent: $UA")

    DECISION=$(echo "$MSGS" | python3 -c "
import sys, json, re
try:
    msgs = json.load(sys.stdin)
    for m in reversed(msgs):
        c = m.get('content', '').lower().strip()
        # Strip emojis and punctuation, check first word
        first = re.split(r'[\s\U00010000-\U0010ffff\U0001F000-\U0001FFFF\u2600-\u27ff]+', c)[0].strip('.,!?')
        if first in ('approve','yes','y','ok','allow','approved','go'):
            print('approve'); break
        elif first in ('deny','no','n','block','cancel','denied','stop','nope'):
            print('deny'); break
except: pass
" 2>/dev/null)

    if [ "$DECISION" = "approve" ]; then
        discord_send "Got it, approved. Running the command now."
        exit 0
    elif [ "$DECISION" = "deny" ]; then
        discord_send "Understood, command blocked. I will not run it."
        echo "You denied this command in Discord. It has been blocked." >&2
        exit 2
    fi
done

# --- Timed out ---
discord_send "No response after 5 minutes. I have blocked the command for safety."
echo "No approval received after 5 minutes. Command blocked for safety." >&2
exit 2
