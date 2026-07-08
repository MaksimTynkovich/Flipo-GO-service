#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/ngrok-env.sh
source "$ROOT/scripts/lib/ngrok-env.sh"

sync_env_from_ngrok
