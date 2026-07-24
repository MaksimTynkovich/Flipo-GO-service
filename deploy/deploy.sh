#!/usr/bin/env bash
# Run on the production host after code + prebuilt API binary are synced.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/deploy"

mkdir -p "$ROOT/deploy/prebuilt" "$ROOT/logs" "$ROOT/data/telegram" "$ROOT/data/gifts" "$ROOT/data/cases"

if [[ ! -x "$ROOT/deploy/prebuilt/api" ]]; then
  echo "missing executable: deploy/prebuilt/api" >&2
  exit 1
fi

echo "==> building api + web images"
docker compose --env-file ../.env build api web

echo "==> starting stack"
docker compose --env-file ../.env up -d

echo "==> pruning dangling images"
docker image prune -f >/dev/null || true

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet caddy; then
  echo "==> reloading caddy"
  systemctl reload caddy
fi

echo "==> waiting for api health"
for _ in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready

echo "==> waiting for web"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS -o /dev/null http://127.0.0.1:3000/

echo "deploy ok"
