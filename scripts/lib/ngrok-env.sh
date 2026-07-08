#!/usr/bin/env bash

_NGROK_ENV_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_NGROK_ENV_ROOT="$(cd "$_NGROK_ENV_LIB_DIR/../.." && pwd)"

NGROK_API="${NGROK_API:-http://127.0.0.1:4040/api/tunnels}"

ngrok_root() {
  echo "$_NGROK_ENV_ROOT"
}

ngrok_env_file() {
  echo "$_NGROK_ENV_ROOT/.env"
}

ngrok_project_config() {
  echo "$_NGROK_ENV_ROOT/deploy/ngrok.endpoints.yml"
}

detect_ngrok_user_config() {
  if [[ -f "$HOME/Library/Application Support/ngrok/ngrok.yml" ]]; then
    echo "$HOME/Library/Application Support/ngrok/ngrok.yml"
  elif [[ -f "$HOME/.config/ngrok/ngrok.yml" ]]; then
    echo "$HOME/.config/ngrok/ngrok.yml"
  fi
}

ngrok_is_running() {
  curl -sf "$NGROK_API" >/dev/null 2>&1
}

read_ngrok_public_url() {
  curl -sf "$NGROK_API" | python3 -c "
import json, sys

def port_from_addr(addr: str) -> str:
    return addr.rsplit(':', 1)[-1].split('/')[0]

data = json.load(sys.stdin)
tunnels = data.get('tunnels', [])
if not tunnels:
    sys.exit(1)

by_port = {}
for t in tunnels:
    by_port[port_from_addr(t['config']['addr'])] = t['public_url']

if '3000' in by_port:
    print(by_port['3000'])
    sys.exit(0)

print(tunnels[0]['public_url'])
"
}

read_ngrok_web_url() {
  read_ngrok_public_url
}

read_ngrok_api_url() {
  read_ngrok_public_url
}

read_ngrok_tunnel_urls() {
  local url
  url="$(read_ngrok_public_url)"
  echo "$url $url"
}

wait_for_ngrok_tunnels() {
  echo "Waiting for ngrok tunnel (web:3000)..."
  for _ in $(seq 1 30); do
    if ngrok_is_running && read_ngrok_public_url >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_ngrok_detached() {
  local user_config project_config
  project_config="$(ngrok_project_config)"
  user_config="$(detect_ngrok_user_config || true)"

  if [[ -z "$user_config" ]]; then
    echo "No global ngrok config found. Run: ngrok config add-authtoken <token>"
    return 1
  fi

  if [[ ! -f "$project_config" ]]; then
    echo "Missing $project_config"
    return 1
  fi

  if ngrok_is_running; then
    echo "ngrok already running."
    return 0
  fi

  echo "Starting ngrok in background (web -> :3000)..."
  nohup ngrok start web --config "$project_config,$user_config" --log=stdout \
    > "$(ngrok_root)/ngrok.log" 2>&1 &
  echo "ngrok log: $(ngrok_root)/ngrok.log"
}

sync_env_from_ngrok() {
  local env_file public_url ws_url webhook_url bot_username
  env_file="$(ngrok_env_file)"

  if [[ ! -f "$env_file" ]]; then
    echo "Missing $env_file"
    return 1
  fi

  if ! ngrok_is_running; then
    echo "ngrok is not running. Start it with: make dev-tunnel"
    return 1
  fi

  public_url="$(read_ngrok_public_url)"
  ws_url="${public_url/https:/wss:}"
  webhook_url="${public_url}/api/v1/telegram/webhook"
  bot_username="$(grep -E '^NEXT_PUBLIC_BOT_NAME=' "$env_file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  bot_username="${bot_username#@}"

  PUBLIC_URL="$public_url" WS_URL="$ws_url" WEBHOOK_URL="$webhook_url" BOT_USERNAME="$bot_username" ENV_FILE="$env_file" python3 <<'PY'
import os
import re
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
text = path.read_text()

def set_var(name: str, value: str) -> None:
    global text
    pattern = rf"^{re.escape(name)}=.*$"
    line = f"{name}={value}"
    if re.search(pattern, text, flags=re.M):
        text = re.sub(pattern, line, text, flags=re.M)
    else:
        text = text.rstrip() + f"\n{line}\n"

public_url = os.environ["PUBLIC_URL"]
ws_url = os.environ["WS_URL"]
webhook_url = os.environ["WEBHOOK_URL"]
bot_username = os.environ.get("BOT_USERNAME", "").strip()

set_var("NEXT_PUBLIC_API_URL", public_url)
set_var("NEXT_PUBLIC_WS_URL", ws_url)
set_var("NEXT_PUBLIC_APP_URL", public_url)
set_var("TELEGRAM_WEBAPP_URL", public_url)
set_var("TELEGRAM_WEBHOOK_URL", webhook_url)
set_var("NEXT_PUBLIC_DEBUG_AUTH", "false")
set_var("DEBUG_AUTH_ENABLED", "false")

if bot_username:
    set_var("BOT_USERNAME", bot_username)
    set_var("NEXT_PUBLIC_BOT_USERNAME", bot_username)
    set_var("WEBAPP_SHORT_NAME", "app")
    set_var("NEXT_PUBLIC_WEBAPP_SHORT_NAME", "app")

path.write_text(text)
PY

  echo "Public URL:      $public_url"
  echo "API (proxied):   $public_url/api/v1"
  echo "WS (proxied):    $ws_url/ws"
  echo "Webhook:         $webhook_url"
}
