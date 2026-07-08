#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ngrok-env.sh
source "$ROOT/scripts/lib/ngrok-env.sh"

if ! ngrok_is_running; then
  echo "ngrok is not running."
  echo "Start tunnels with: make dev-tunnel"
  exit 1
fi

echo "Syncing .env from running ngrok..."
sync_env_from_ngrok
echo ""

make -C "$ROOT" up
echo "Starting API and Web (ngrok stays running)..."
echo ""

make -C "$ROOT" -j2 api web
