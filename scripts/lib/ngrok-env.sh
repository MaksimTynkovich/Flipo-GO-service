#!/usr/bin/env bash

NGROK_API="${NGROK_API:-http://127.0.0.1:4040/api/tunnels}"

ngrok_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

ngrok_env_file() {
  echo "$(ngrok_root)/.env"
}

ngrok_project_config() {
  echo "$(ngrok_root)/deploy/ngrok.endpoints.yml"
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

wait_for_ngrok_tunnels() {
  echo "Waiting for ngrok tunnels (web:3000, api:8080)..."
  for _ in $(seq 1 30); do
    if ngrok_is_running && read_ngrok_tunnel_urls >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

read_ngrok_tunnel_urls() {
  curl -sf "$NGROK_API" | python3 -c "
import json, sys

def port_from_addr(addr: str) -> str:
    return addr.rsplit(':', 1)[-1].split('/')[0]

data = json.load(sys.stdin)
by_port = {}
for t in data.get('tunnels', []):
    by_port[port_from_addr(t['config']['addr'])] = t['public_url']

web = by_port.get('3000', '')
api = by_port.get('8080', '')
if not web or not api:
    sys.exit(1)

print(web, api)
"
}

sync_env_from_ngrok() {
  local env_file web_url api_url ws_url
  env_file="$(ngrok_env_file)"

  if [[ ! -f "$env_file" ]]; then
    echo "Missing $env_file"
    return 1
  fi

  if ! ngrok_is_running; then
    echo "ngrok is not running. Start it with: make tunnel"
    return 1
  fi

  read -r web_url api_url <<< "$(read_ngrok_tunnel_urls)"
  ws_url="${api_url/https:/wss:}"

  WEB_URL="$web_url" API_URL="$api_url" WS_URL="$ws_url" ENV_FILE="$env_file" python3 <<'PY'
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

set_var("NEXT_PUBLIC_API_URL", os.environ["API_URL"])
set_var("NEXT_PUBLIC_WS_URL", os.environ["WS_URL"])
set_var("NEXT_PUBLIC_DEBUG_AUTH", "false")
set_var("DEBUG_AUTH_ENABLED", "false")

path.write_text(text)
PY

  echo "Web (BotFather): $web_url"
  echo "API:             $api_url"
  echo "WS:              $ws_url"
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

  echo "Starting ngrok in background..."
  nohup ngrok start --all --config "$project_config,$user_config" --log=stdout \
    > "$(ngrok_root)/ngrok.log" 2>&1 &
  echo "ngrok log: $(ngrok_root)/ngrok.log"
}
