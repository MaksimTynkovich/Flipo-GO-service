#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
ENV_BACKUP="$ROOT/.env.bak"
# shellcheck source=lib/ngrok-env.sh
source "$ROOT/scripts/lib/ngrok-env.sh"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install: brew install ngrok"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.example first."
  exit 1
fi

if ! ngrok_is_running; then
  cp "$ENV_FILE" "$ENV_BACKUP"
  echo "Backed up .env → .env.bak"
  start_ngrok_detached || {
    echo "Failed to start ngrok. Check $(ngrok_root)/ngrok.log"
    exit 1
  }
  wait_for_ngrok_tunnels || {
    echo "Failed to start ngrok tunnels. Check $(ngrok_root)/ngrok.log"
    exit 1
  }
else
  echo "Using already running ngrok."
fi

echo ""
sync_env_from_ngrok
echo ""
echo "👉 BotFather Web App URL: $(read_ngrok_public_url)"
echo "👉 Telegram webhook:     $(read_ngrok_public_url)/api/v1/telegram/webhook"
echo "   (регистрируется при старте API, если TELEGRAM_WEBHOOK_URL задан в .env)"
echo ""
echo "ngrok will keep running after you stop API/Web."
echo "Next time restart only servers with: make dev-remote"
echo ""

make -C "$ROOT" up
make -C "$ROOT" -j2 api web
