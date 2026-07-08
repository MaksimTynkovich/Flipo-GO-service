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
  start_dev_tunnels || {
    echo "Failed to start dev tunnels."
    echo "ngrok log:       $(ngrok_root)/ngrok.log"
    echo "localtunnel log: $(localtunnel_log)"
    exit 1
  }
else
  echo "Using already running ngrok."
  if ! localtunnel_is_running; then
    start_localtunnel_detached
    wait_for_localtunnel_web || {
      echo "Failed to start localtunnel. Check $(localtunnel_log)"
      exit 1
    }
  else
    echo "Using already running localtunnel."
  fi
fi

echo ""
sync_env_from_tunnels
echo ""
echo "👉 BotFather Web App URL: $(read_ngrok_tunnel_urls | awk '{print $1}')"
echo "👉 Telegram webhook:     $(read_ngrok_tunnel_urls | awk '{print $2}')/api/v1/telegram/webhook"
echo "   (регистрируется при старте API, если TELEGRAM_WEBHOOK_URL задан в .env)"
echo ""
echo "ngrok will keep running after you stop API/Web."
echo "localtunnel stops when its process exits — restart with: make dev-tunnel"
echo "Next time restart only servers with: make dev-remote"
echo ""

make -C "$ROOT" up
make -C "$ROOT" -j2 api web
