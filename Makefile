.PHONY: dev dev-tunnel dev-remote tunnel sync-tunnel-env up down migrate api web test lint

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
	cd apps/api && go run ./cmd/server --migrate-only

tg-auth:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/tgauth

scan-gifts:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/tgscan \
		$(if $(TELEGRAM_ID),-telegram-id $(TELEGRAM_ID),) \
		$(if $(USERNAME),-username $(USERNAME),) \
		$(if $(SELF),-self,) \
		-verbose $(if $(RAW),-raw,)

process-deposits:
	@set -a && [ -f .env ] && . ./.env; set +a; cd apps/api && go run ./cmd/process-deposits

test:
	cd apps/api && go test ./...

lint:
	cd apps/api && go vet ./...

build-api:
	cd apps/api && go build -o ../../bin/api ./cmd/server

build-worker:
	cd apps/api && go build -o ../../bin/worker ./cmd/worker
