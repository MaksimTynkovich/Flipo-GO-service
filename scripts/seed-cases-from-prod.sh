#!/usr/bin/env bash
# Sync case catalog (covers + loot + live-feed + promos) from production into local DB.
# Requires: ssh key ~/.ssh/flipo_deploy, local postgres on DATABASE_URL / docker deploy-postgres-1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_KEY="${FLIP_DEPLOY_SSH_KEY:-$HOME/.ssh/flipo_deploy}"
PROD_HOST="${FLIP_PROD_HOST:-root@5.252.155.209}"
PROD_PATH="${FLIP_PROD_PATH:-/opt/flipo}"
SEED_SQL="$ROOT/apps/api/seeds/cases_from_prod.sql"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$SSH_KEY" ]]; then
  echo "missing ssh key: $SSH_KEY" >&2
  exit 1
fi

ssh_prod() {
  ssh -i "$SSH_KEY" -o ConnectTimeout=15 "$PROD_HOST" "$@"
}

psql_prod() {
  ssh_prod "cd $PROD_PATH/deploy && set -a && . ../.env && set +a && docker compose --env-file ../.env exec -T postgres psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -v ON_ERROR_STOP=1"
}

echo "==> exporting cases from prod..."
psql_prod <<'SQL' > "$TMP/cases.csv"
\copy (SELECT id, slug, title, image_url, accent_color, price_nanoton, kind, sort_order, active, require_channel, target_rtp_bps, created_at, updated_at, required_name_tag, require_share FROM cases WHERE deleted_at IS NULL ORDER BY sort_order, slug) TO STDOUT WITH CSV HEADER
SQL

psql_prod <<'SQL' > "$TMP/loot.csv"
\copy (SELECT e.id, e.case_id, e.prize_type, e.collection_slug, e.weight, e.display_name, e.image_url, e.rarity_label, e.tile_background_color, e.sort_order, e.floor_price_nanoton, e.amount_nanoton, e.created_at, e.model_name, e.collection_name, e.backdrop FROM case_loot_entries e JOIN cases c ON c.id = e.case_id WHERE c.deleted_at IS NULL ORDER BY e.case_id, e.sort_order, e.id) TO STDOUT WITH CSV HEADER
SQL

psql_prod <<'SQL' > "$TMP/live_feed.csv"
\copy (SELECT id, enabled, intensity, fill_when_sparse, min_visible, common_weight, uncommon_weight, rare_weight, epic_weight, legendary_weight, fat_chance, fat_min_floor_nanoton, updated_at, common_max_nanoton, uncommon_max_nanoton, rare_max_nanoton, epic_max_nanoton FROM case_live_feed_settings) TO STDOUT WITH CSV HEADER
SQL

psql_prod <<'SQL' > "$TMP/promos.csv"
\copy (SELECT code, case_id, max_uses, 0 AS used_count, active, expires_at, created_at FROM case_promo_codes ORDER BY created_at, code) TO STDOUT WITH CSV HEADER
SQL

echo "==> generating $SEED_SQL"
python3 - "$TMP" "$SEED_SQL" <<'PY'
import csv, sys
from pathlib import Path
from datetime import datetime, timezone

src, out_path = Path(sys.argv[1]), Path(sys.argv[2])
out_path.parent.mkdir(parents=True, exist_ok=True)

def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def sql_bool(v):
    return "TRUE" if v in ("t", "true", "TRUE", "1") else "FALSE"

def sql_ts(v):
    return "NOW()" if not v else sql_str(v)

def sql_num(v, default="0"):
    return default if v is None or v == "" else v

lines = [
    "-- Seed: production cases catalog (flipo.rest snapshot)",
    "-- Generated: %s" % datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
    "-- Content: cases + loot + live-feed settings + promo codes (used_count reset).",
    "-- Safe for local/dev. Do NOT run blindly on production.",
    "BEGIN;",
    "",
    "-- Clear dependent local rows (dev opens/history).",
    "DO $$ BEGIN",
    "  IF to_regclass('public.case_quest_share_prepared') IS NOT NULL THEN DELETE FROM case_quest_share_prepared; END IF;",
    "  IF to_regclass('public.case_quest_shares') IS NOT NULL THEN DELETE FROM case_quest_shares; END IF;",
    "  IF to_regclass('public.case_promo_redemptions') IS NOT NULL THEN DELETE FROM case_promo_redemptions; END IF;",
    "  IF to_regclass('public.case_promo_codes') IS NOT NULL THEN DELETE FROM case_promo_codes; END IF;",
    "  IF to_regclass('public.case_opens') IS NOT NULL THEN DELETE FROM case_opens; END IF;",
    "  IF to_regclass('public.user_case_cooldowns') IS NOT NULL THEN DELETE FROM user_case_cooldowns; END IF;",
    "  IF to_regclass('public.user_case_entitlements') IS NOT NULL THEN DELETE FROM user_case_entitlements; END IF;",
    "  IF to_regclass('public.case_loot_entries') IS NOT NULL THEN DELETE FROM case_loot_entries; END IF;",
    "  IF to_regclass('public.cases') IS NOT NULL THEN DELETE FROM cases; END IF;",
    "END $$;",
    "",
]

with (src / "cases.csv").open(newline="") as f:
    rows = list(csv.DictReader(f))

lines += [
    "-- cases (%d)" % len(rows),
    "INSERT INTO cases (",
    "  id, slug, title, image_url, accent_color, price_nanoton, kind, sort_order,",
    "  active, require_channel, target_rtp_bps, created_at, updated_at,",
    "  deleted_at, required_name_tag, require_share",
    ") VALUES",
]
case_vals = []
for r in rows:
    case_vals.append(
        "  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)"
        % (
            sql_str(r["id"]),
            sql_str(r["slug"]),
            sql_str(r["title"]),
            sql_str(r["image_url"]),
            sql_str(r["accent_color"]),
            sql_num(r["price_nanoton"]),
            sql_str(r["kind"]),
            sql_num(r["sort_order"]),
            sql_bool(r["active"]),
            sql_bool(r["require_channel"]),
            sql_num(r["target_rtp_bps"], "9000"),
            sql_ts(r["created_at"]),
            sql_ts(r["updated_at"]),
            sql_str(r["required_name_tag"] or ""),
            sql_bool(r["require_share"]),
        )
    )
lines.append(",\n".join(case_vals) + ";")
lines.append("")

with (src / "loot.csv").open(newline="") as f:
    loot = list(csv.DictReader(f))

lines.append("-- case_loot_entries (%d)" % len(loot))
CHUNK = 40
for i in range(0, len(loot), CHUNK):
    chunk = loot[i : i + CHUNK]
    lines += [
        "INSERT INTO case_loot_entries (",
        "  id, case_id, prize_type, collection_slug, weight, display_name, image_url,",
        "  rarity_label, tile_background_color, sort_order, floor_price_nanoton, amount_nanoton,",
        "  created_at, model_name, collection_name, backdrop",
        ") VALUES",
    ]
    vals = []
    for r in chunk:
        vals.append(
            "  (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            % (
                sql_str(r["id"]),
                sql_str(r["case_id"]),
                sql_str(r["prize_type"] or "gift"),
                sql_str(r["collection_slug"] or ""),
                sql_num(r["weight"]),
                sql_str(r["display_name"]),
                sql_str(r["image_url"] or ""),
                sql_str(r["rarity_label"] or ""),
                sql_str(r["tile_background_color"] or ""),
                sql_num(r["sort_order"]),
                sql_num(r["floor_price_nanoton"]),
                sql_num(r["amount_nanoton"]),
                sql_ts(r["created_at"]),
                sql_str(r["model_name"] or ""),
                sql_str(r["collection_name"] or ""),
                sql_str(r["backdrop"] or ""),
            )
        )
    lines.append(",\n".join(vals) + ";")
    lines.append("")

with (src / "live_feed.csv").open(newline="") as f:
    live = list(csv.DictReader(f))

lines.append("-- case_live_feed_settings")
for r in live:
    lines += [
        "INSERT INTO case_live_feed_settings (",
        "  id, enabled, intensity, fill_when_sparse, min_visible,",
        "  common_weight, uncommon_weight, rare_weight, epic_weight, legendary_weight,",
        "  fat_chance, fat_min_floor_nanoton, updated_at,",
        "  common_max_nanoton, uncommon_max_nanoton, rare_max_nanoton, epic_max_nanoton",
        ") VALUES (",
        "  %s, %s, %s, %s, %s,"
        % (
            sql_num(r["id"], "1"),
            sql_bool(r["enabled"]),
            # Floor intensity for local DX — prod often parks at 0.05 (~80s drip).
            sql_num(str(max(float(r["intensity"] or "1"), 0.5))),
            sql_bool(r["fill_when_sparse"]),
            sql_num(r["min_visible"]),
        ),
        "  %s, %s, %s, %s, %s,"
        % (
            sql_num(r["common_weight"]),
            sql_num(r["uncommon_weight"]),
            sql_num(r["rare_weight"]),
            sql_num(r["epic_weight"]),
            sql_num(r["legendary_weight"]),
        ),
        "  %s, %s, %s,"
        % (
            sql_num(r["fat_chance"]),
            sql_num(r["fat_min_floor_nanoton"]),
            sql_ts(r["updated_at"]),
        ),
        "  %s, %s, %s, %s"
        % (
            sql_num(r["common_max_nanoton"]),
            sql_num(r["uncommon_max_nanoton"]),
            sql_num(r["rare_max_nanoton"]),
            sql_num(r["epic_max_nanoton"]),
        ),
        ")",
        "ON CONFLICT (id) DO UPDATE SET",
        "  enabled = EXCLUDED.enabled, intensity = EXCLUDED.intensity, fill_when_sparse = EXCLUDED.fill_when_sparse,",
        "  min_visible = EXCLUDED.min_visible, common_weight = EXCLUDED.common_weight, uncommon_weight = EXCLUDED.uncommon_weight,",
        "  rare_weight = EXCLUDED.rare_weight, epic_weight = EXCLUDED.epic_weight, legendary_weight = EXCLUDED.legendary_weight,",
        "  fat_chance = EXCLUDED.fat_chance, fat_min_floor_nanoton = EXCLUDED.fat_min_floor_nanoton, updated_at = EXCLUDED.updated_at,",
        "  common_max_nanoton = EXCLUDED.common_max_nanoton, uncommon_max_nanoton = EXCLUDED.uncommon_max_nanoton,",
        "  rare_max_nanoton = EXCLUDED.rare_max_nanoton, epic_max_nanoton = EXCLUDED.epic_max_nanoton;",
        "",
    ]

with (src / "promos.csv").open(newline="") as f:
    promos = list(csv.DictReader(f))

lines.append("-- case_promo_codes (%d; used_count reset for local)" % len(promos))
if promos:
    lines.append(
        "INSERT INTO case_promo_codes (code, case_id, max_uses, used_count, active, expires_at, created_at) VALUES"
    )
    vals = []
    for r in promos:
        exp = "NULL" if not r.get("expires_at") else sql_ts(r["expires_at"])
        vals.append(
            "  (%s, %s, %s, 0, %s, %s, %s)"
            % (
                sql_str(r["code"]),
                sql_str(r["case_id"]),
                sql_num(r["max_uses"]),
                sql_bool(r["active"]),
                exp,
                sql_ts(r["created_at"]),
            )
        )
    lines.append(",\n".join(vals) + ";")
    lines.append("")

starter = next((r for r in rows if r["slug"] == "starter"), None)
if starter:
    lines += [
        "-- Point daily quest free-case rewards at prod starter (Redo), if quests table exists.",
        "DO $$ BEGIN",
        "  IF to_regclass('public.daily_quests') IS NOT NULL THEN",
        "    UPDATE daily_quests SET reward_case_id = %s" % sql_str(starter["id"]),
        "    WHERE reward_type = 'free_case_open' AND reward_case_id IS NOT NULL;",
        "  END IF;",
        "  IF to_regclass('public.daily_quest_board_settings') IS NOT NULL THEN",
        "    UPDATE daily_quest_board_settings SET bonus_reward_case_id = %s" % sql_str(starter["id"]),
        "    WHERE bonus_reward_type = 'free_case_open';",
        "  END IF;",
        "END $$;",
        "",
    ]

lines.append("COMMIT;")
out_path.write_text("\n".join(lines) + "\n")
print("cases=%d loot=%d promos=%d" % (len(rows), len(loot), len(promos)))
PY

echo "==> syncing case cover images..."
mkdir -p "$ROOT/data/cases" "$ROOT/apps/api/data/cases"
python3 -c "import csv; print('\n'.join(r['image_url'].rsplit('/',1)[-1] for r in csv.DictReader(open('$TMP/cases.csv'))))" > "$TMP/images.txt"
rsync -az -e "ssh -i $SSH_KEY" --files-from="$TMP/images.txt" \
  "$PROD_HOST:$PROD_PATH/data/cases/" \
  "$ROOT/data/cases/"
rsync -a "$ROOT/data/cases/" "$ROOT/apps/api/data/cases/"

apply_sql() {
  if docker ps --format '{{.Names}}' | grep -qx 'deploy-postgres-1'; then
    docker exec -i deploy-postgres-1 psql -U flipo -d flipo -v ON_ERROR_STOP=1
    return
  fi
  if command -v psql >/dev/null 2>&1; then
    set -a
    # shellcheck disable=SC1091
    [[ -f "$ROOT/.env" ]] && . "$ROOT/.env"
    set +a
    psql "${DATABASE_URL:?DATABASE_URL required}" -v ON_ERROR_STOP=1
    return
  fi
  echo "no local postgres client / deploy-postgres-1 container" >&2
  exit 1
}

echo "==> applying seed to local DB..."
apply_sql < "$SEED_SQL"

echo "OK: local cases match prod catalog (covers in data/cases + apps/api/data/cases)"
