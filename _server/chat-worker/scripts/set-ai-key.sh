#!/usr/bin/env bash
# Replaces only the Anthropic API key of the chat Worker (other secrets and Telegram stay as they are).
# Copy the new key (Cmd+C), run: bash scripts/set-ai-key.sh – and press Enter. Nothing is shown on screen.
set -euo pipefail
cd "$(dirname "$0")/.."
while true; do
  read -rsp "New Anthropic API key – copy it, then press Enter (do not paste): " v; echo
  [ -z "$v" ] && v=$(pbpaste 2>/dev/null | tr -d '[:space:]')
  if printf '%s' "$v" | grep -Eq '^sk-ant-[A-Za-z0-9_-]{60,140}$'; then echo "  ✓ key received (${#v} characters)"; break; fi
  echo "  ✗ That does not look like one Anthropic key (sk-ant-…, about 100 characters; got ${#v}). Copy the key once more and just press Enter (Ctrl-C to stop)."
done
printf '%s' "$v" | npx --yes wrangler@4 secret put AI_API_KEY >/dev/null && echo "✓ AI_API_KEY replaced – the chat uses the new key within a minute"
unset v
pbcopy < /dev/null 2>/dev/null || true   # clear the clipboard
echo "Done. Tell Claude: готово"
