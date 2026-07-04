#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ngrok-env.sh
source "$ROOT/scripts/lib/ngrok-env.sh"

ENV_FILE="$(ngrok_env_file)"
ENV_BACKUP="$ROOT/.env.bak"
PROJECT_NGROK_CONFIG="$(ngrok_project_config)"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install: brew install ngrok"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.example first."
  exit 1
fi

user_config="$(detect_ngrok_user_config || true)"
if [[ -z "$user_config" ]]; then
  echo "No global ngrok config found. Run: ngrok config add-authtoken <token>"
  exit 1
fi

if [[ ! -f "$PROJECT_NGROK_CONFIG" ]]; then
  echo "Missing $PROJECT_NGROK_CONFIG"
  exit 1
fi

if ngrok_is_running; then
  echo "ngrok is already running — syncing .env from current tunnels."
  echo ""
  sync_env_from_ngrok
  echo ""
  echo "👉 BotFather Web App URL: $(read_ngrok_tunnel_urls | awk '{print $1}')"
  echo ""
  echo "Restart API/Web without touching ngrok: make dev-remote"
  exit 0
fi

cp "$ENV_FILE" "$ENV_BACKUP"
echo "Backed up .env → .env.bak"

echo "Starting ngrok..."
ngrok start --all --config "$PROJECT_NGROK_CONFIG,$user_config" &
NGROK_PID=$!

trap 'kill "$NGROK_PID" 2>/dev/null || true' EXIT INT TERM

wait_for_ngrok_tunnels || {
  echo "Failed to start ngrok tunnels."
  exit 1
}

echo ""
sync_env_from_ngrok
echo ""
echo "👉 BotFather Web App URL: $(read_ngrok_tunnel_urls | awk '{print $1}')"
echo ""
echo "Keep this terminal open. Restart API/Web anytime with: make dev-remote"
echo ""

wait "$NGROK_PID"
