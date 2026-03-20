#!/bin/bash
# Receives Claude Code hook event JSON on stdin, appends to activity log
LOG="/opt/stacks/ai-monitor/activity.log"
INPUT=$(cat)
HOOK_TYPE="${HOOK_TYPE:-unknown}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

# Extract tool name and key info from input
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name', d.get('tool_input',{}).get('command','')[:60] if isinstance(d.get('tool_input'),dict) else ''))" 2>/dev/null || echo "")
INPUT_PREVIEW=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
if isinstance(ti, dict):
    # prioritize meaningful fields
    for k in ['command','pattern','file_path','query','prompt','description','skill']:
        if k in ti:
            val = str(ti[k])[:120]
            print(val)
            sys.exit()
    # fallback: first value
    if ti:
        print(str(list(ti.values())[0])[:120])
" 2>/dev/null || echo "")

RESULT_PREVIEW=""
if [ "$HOOK_TYPE" = "PostToolUse" ]; then
    RESULT_PREVIEW=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
out = d.get('tool_response', {})
if isinstance(out, str):
    print(out[:100])
elif isinstance(out, dict):
    print(str(out)[:100])
" 2>/dev/null || echo "")
fi

echo "{\"ts\":\"$TS\",\"type\":\"$HOOK_TYPE\",\"tool\":\"$TOOL\",\"preview\":$(echo "$INPUT_PREVIEW" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),\"result\":$(echo "$RESULT_PREVIEW" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))")}" >> "$LOG"
