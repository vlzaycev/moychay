#!/usr/bin/env bash
# Sets the chat Worker's secrets and the Telegram webhook. Run it yourself in the terminal:
#   cd _server/chat-worker && bash scripts/setup-secrets.sh https://teaphuket-chat.<subdomain>.workers.dev
# Values are typed hidden (nothing on screen, nothing in shell history) and go straight to Cloudflare.
# The webhook secret and the hashing salt are generated here and never shown.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:?usage: bash scripts/setup-secrets.sh https://teaphuket-chat.<subdomain>.workers.dev}"
BASE="${BASE%/}"

# Each value: copy it (Cmd+C), then press Enter here – the script takes it from the clipboard.
# (Pasting into the hidden prompt also works; nothing is shown either way.)
ask() {   # $1 prompt, $2 regex, $3 name for messages → prints the value
  local v
  while true; do
    read -rsp "$1 – copy it, then press Enter: " v; echo >&2
    [ -z "$v" ] && v=$(pbpaste 2>/dev/null | tr -d '[:space:]')
    if printf '%s' "$v" | grep -Eq "$2"; then echo "  ✓ $3 received (${#v} characters)" >&2; printf '%s' "$v"; return; fi
    echo "  ✗ That does not look like a $3. Copy it again and press Enter (Ctrl-C to stop)." >&2
  done
}
AI_KEY=$(ask "1/3 Anthropic API key" '^sk-ant-[A-Za-z0-9_-]{20,}$' "Anthropic key")
BOT=$(ask "2/3 Live support bot token (BotFather)" '^[0-9]{6,}:[A-Za-z0-9_-]{30,}$' "bot token")
TS=$(ask "3/3 Turnstile secret key (Cloudflare → Turnstile → teaphuket.com → Settings)" '^0x[A-Za-z0-9_-]{20,}$' "Turnstile secret")
SECRET=$(openssl rand -hex 32)
SALT=$(openssl rand -hex 32)

put() { printf '%s' "$2" | npx wrangler@4 secret put "$1" >/dev/null && echo "✓ $1"; }
put AI_API_KEY "$AI_KEY"
put TELEGRAM_SUPPORT_BOT_TOKEN "$BOT"
put TURNSTILE_SECRET "$TS"
put TELEGRAM_WEBHOOK_SECRET "$SECRET"
put HASH_SALT "$SALT"

R=$(curl -s "https://api.telegram.org/bot${BOT}/setWebhook" \
  --data-urlencode "url=${BASE}/api/chat/telegram" \
  --data-urlencode "secret_token=${SECRET}" \
  --data-urlencode 'allowed_updates=["message","callback_query"]' \
  -d drop_pending_updates=true)
case "$R" in *'"ok":true'*) echo "✓ Telegram webhook";; *) echo "✗ Telegram webhook: $(printf '%s' "$R" | sed 's/bot[0-9]*:[A-Za-z0-9_-]*/bot***/g')";; esac
unset AI_KEY BOT TS SECRET SALT
pbcopy < /dev/null 2>/dev/null || true   # clear the clipboard
echo "Done. Tell Claude: готово"
