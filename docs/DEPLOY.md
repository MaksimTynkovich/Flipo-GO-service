# Flipo — production deploy

## What changed for prod readiness

- Removed auto-seed of **9 fake market gifts** on every migrate/boot (`SeedMarketMockData`).
- `ENV=production` refuses: debug auth, TON chain-dev mode, weak `JWT_SECRET`, missing bot/webhook/admin.
- Admin IDs no longer fall back to `DEBUG_TELEGRAM_ID`.
- CORS supports `CORS_ORIGINS` (default `*` for local; set real origins in prod).
- Compose/Dockerfile updated for real secrets and `NEXT_PUBLIC_*` build args.

Platform defaults that **remain** (product, not demo): game configs, staking quests, promo `REF_WELCOME`, bot user for real market listings (`EnsureBotUser`).

---

## Pre-flight checklist

### Secrets & flags (blockers)

| Item | Required value |
|------|----------------|
| `ENV` | `production` |
| `JWT_SECRET` | long random string (not `dev-secret` / placeholders) |
| `DEBUG_AUTH_ENABLED` | `false` |
| `NEXT_PUBLIC_DEBUG_AUTH` | `false` |
| `TON_CHAIN_DEV_MODE` | `false` |
| `ADMIN_TELEGRAM_IDS` | your Telegram user ID(s) |
| `BOT_TOKEN` | from @BotFather |
| `TELEGRAM_WEBAPP_URL` | public HTTPS Mini App URL |
| `TELEGRAM_WEBHOOK_URL` | `https://…/api/v1/telegram/webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | random; must match Telegram registration |
| `TON_DEPOSIT_ADDRESS` | hot/deposit wallet address |
| `TON_HOT_WALLET_MNEMONIC` | hot wallet seed (store in secret manager) |
| `TON_API_KEY` | toncenter (or equivalent) API key |
| `POSTGRES_PASSWORD` | strong; not `flipo` |

### Telegram

1. BotFather → set Web App URL to `TELEGRAM_WEBAPP_URL`.
2. API registers webhook on boot when `TELEGRAM_WEBHOOK_URL` is set.
3. Keep `TELEGRAM_WEBHOOK_SECRET` private; Telegram sends it as `X-Telegram-Bot-Api-Secret-Token`.
4. Optional MTProto (`TELEGRAM_API_ID/HASH/PHONE` + session file) for scanning user profile gifts. Without it, gift scan returns “not configured” (no fake gifts in prod).

### Networking

- Terminate TLS at nginx/Caddy/Cloudflare in front of `web` (and/or `api`).
- Do **not** expose Postgres/Redis to the public internet.
- Prefer same-origin: browser hits `https://your-domain.com`, Next rewrites `/api/v1` and `/ws` to the API (`API_UPSTREAM`).
- If the browser talks to API on another host, set `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` at **image build** time and `CORS_ORIGINS` to the web origin.

### TON treasury

- Hot wallet pays withdrawals; excess can sweep to `TON_COLD_WALLET_ADDRESS`.
- Fund the hot wallet before enabling withdrawals.
- Confirm `TON_HOT_WALLET_VERSION` matches the derived wallet.

### Ops

- Logs: `LOG_FILE` must be writable (`deploy/docker-compose.yml` mounts `logs/`).
- Health: `GET /health` (liveness), `GET /ready` (DB).
- Migrations run automatically on API start (GORM AutoMigrate).
- Social sim stays **off** until enabled in admin; leave off for real launch unless you want fake lobby activity.
- Local-only: `scripts/*tunnel*`, ngrok, Makefile `dev-tunnel` — do not run in prod.

---

## Deploy with Docker Compose

```bash
cp .env.example .env
# edit .env — set all production values above

mkdir -p logs
cd deploy
docker compose up -d --build
```

Compose expects `POSTGRES_PASSWORD` and a filled root `.env`. API forces `DEBUG_AUTH_ENABLED=false` and `TON_CHAIN_DEV_MODE=false`.

Check:

```bash
curl -sS https://your-domain.com/health
curl -sS https://your-domain.com/ready
```

Open the bot in Telegram and confirm Mini App auth works (no debug login UI).

---

## Manual / bare metal

```bash
# infra
docker compose -f deploy/docker-compose.yml up -d postgres redis

# API
cd apps/api && go build -o ../../bin/api ./cmd/server
ENV=production ... ../../bin/api

# Web (bake public URLs at build)
cd apps/web
NEXT_PUBLIC_DEBUG_AUTH=false npm run build
npm run start
```

---

## Post-deploy smoke test

1. Telegram login via Mini App (not `/auth/debug`).
2. Admin panel only for IDs in `ADMIN_TELEGRAM_IDS`.
3. Create a small TON deposit → balance credited (real chain).
4. Place a bet; withdraw a small amount.
5. Market empty until real listings / bot buyback — no mock gifts.
6. Confirm webhook: bot responds to `/start`.

---

## Known residual risks

- CORS default remains `*` if `CORS_ORIGINS` unset — set explicit origins in prod.
- Schema via AutoMigrate only (no versioned migration runner in CI).
- `/health` does not check Redis/TON; `/ready` checks DB only.
- Privacy/terms pages may still be placeholder copy — replace before public launch.
- Hot wallet mnemonic in env is high risk — prefer a secrets vault / KMS.
