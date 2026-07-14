.PHONY: dev dev-tunnel dev-remote tunnel sync-tunnel-env up down migrate api web test lint gift-quote gift-prices-refresh

up:
	docker compose -f deploy/docker-compose.yml up -d postgres redis

down:
	docker compose -f deploy/docker-compose.yml down

dev: up
	@echo "Starting API and Web in dev mode..."
	$(MAKE) -j2 api web

dev-tunnel:
	@chmod +x scripts/dev-tunnel.sh scripts/dev-remote.sh scripts/tunnel.sh scripts/sync-tunnel-env.sh
	@./scripts/dev-tunnel.sh

tunnel:
	@chmod +x scripts/tunnel.sh scripts/sync-tunnel-env.sh
	@./scripts/tunnel.sh

dev-remote:
	@chmod +x scripts/dev-remote.sh scripts/sync-tunnel-env.sh
	@./scripts/dev-remote.sh

sync-tunnel-env:
	@chmod +x scripts/sync-tunnel-env.sh
	@./scripts/sync-tunnel-env.sh

api:
	@-lsof -ti :$${API_PORT:-8080} | xargs kill -9 2>/dev/null || true
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/server

worker:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/worker

web:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/web && PORT=$${WEB_PORT:-3000} npm run dev

migrate:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/server --migrate-only

tg-auth:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/tgauth

scan-gifts:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/tgscan \
		$(if $(TELEGRAM_ID),-telegram-id $(TELEGRAM_ID),) \
		$(if $(USERNAME),-username $(USERNAME),) \
		$(if $(SELF),-self,) \
		-verbose $(if $(RAW),-raw,)

gift-quote:
	@test -n "$(SLUG)" || (echo "Usage: make gift-quote SLUG=surgeBoard-1081" && exit 2)
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/gift-quote \
		$(if $(JSON),-json,) \
		$(if $(ANALYZE),-analyze,) \
		$(if $(MODEL),-model "$(MODEL)",) \
		$(if $(BACKDROP),-backdrop "$(BACKDROP)",) \
		$(if $(SYMBOL),-symbol "$(SYMBOL)",) \
		"$(SLUG)"

gift-prices-refresh:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/gift-prices-refresh

process-deposits:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/process-deposits

staking-tick-daily:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/staking-tick -daily

staking-tick-settle:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/staking-tick -settle

staking-tick:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/staking-tick -daily -settle

test:
	cd apps/api && go test ./...

lint:
	cd apps/api && go vet ./...

build-api:
	cd apps/api && go build -o ../../bin/api ./cmd/server

build-worker:
	cd apps/api && go build -o ../../bin/worker ./cmd/worker
