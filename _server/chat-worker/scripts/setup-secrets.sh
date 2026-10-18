#!/usr/bin/env bash
# Sets the chat Worker's secrets and the Telegram webhook. Run it yourself in the terminal:
#   cd _server/chat-worker && bash scripts/setup-secrets.sh https://teaphuket-chat.<subdomain>.workers.dev
# Values are typed hidden (nothing on screen, nothing in shell history) and go straight to Cloudflare.
# The webhook secret and the hashing salt are generated here and never shown.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:?usage: bash scripts/setup-secrets.sh https://teaphuket-chat.<subdomain>.workers.dev}"
BASE="${BASE%/}"

read -rsp "1/3 Anthropic API key: " AI_KEY; echo
read -rsp "2/3 Live support bot token (from BotFather): " BOT; echo
read -rsp "3/3 Turnstile secret key (Cloudflare → Turnstile → teaphuket.com widget → Settings): " TS; echo
[ -n "$AI_KEY" ] && [ -n "$BOT" ] && [ -n "$TS" ] || { echo "Empty value – nothing was changed."; exit 1; }
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
echo "Done. Tell Claude: готово"
