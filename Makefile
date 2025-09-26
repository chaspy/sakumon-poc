SHELL := /bin/bash
RUN_DIR := .run
LOG_DIR := logs
API_PORT ?= 3031
WEB_PORT ?= 5183

.PHONY: help setup install env db seed dev api web typecheck build clean

help:
	@echo "Targets:"
	@echo "  make setup     # 依存/ENV/DB 初期化"
	@echo "  make dev       # API+Web を同時起動 (フォアグラウンド)"
	@echo "  make start     # フォアグラウンドでAPI/Web起動(アドレス表示)"
	@echo "  make start-bg  # バックグラウンド起動(API/Web)"
	@echo "  make free-ports# 指定ポートの占有プロセスをkillして解放"
	@echo "  make nuke      # 監視系(dev)プロセスを強制終了(安全に使用)"
	@echo "  make stop      # バックグラウンド停止"
	@echo "  make status    # 起動状況"
	@echo "  make logs      # ログ追跡"
	@echo "  make api       # APIのみ起動"
	@echo "  make web       # Webのみ起動"
	@echo "  make seed      # バンク初期データ投入"
	@echo "  make typecheck # 型チェック"
	@echo "  make build     # 全パッケージをビルド"

setup: install env db seed

install:
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm が見つかりません。 https://pnpm.io/ja/installation を参照してください"; exit 1; }
	pnpm i

env:
	@if [ ! -f .env ]; then cp .env.sample .env; echo "作成: .env (OPENAI_API_KEY を編集してください)"; fi
	@grep -q '^DATABASE_URL=' .env || echo 'DATABASE_URL="file:./dev.db"' >> .env
	@mkdir -p apps/api
	@cp .env apps/api/.env
	@echo "同期: apps/api/.env"

db:
	pnpm --filter @sakumon/api prisma:generate
	pnpm --filter @sakumon/api prisma:migrate

seed:
	pnpm --filter @sakumon/api seed

dev:
	pnpm dev

build-packages:
	pnpm --filter @sakumon/schemas --filter @sakumon/workflows --filter @sakumon/pdf build

free-ports:
	@echo "[free-ports] ensure API_PORT=$(API_PORT) / WEB_PORT=$(WEB_PORT) are free"
	@# stop background processes launched via start-bg (if any)
	@if [ -f $(RUN_DIR)/api.pid ]; then echo "[free-ports] killing bg api pid $$(cat $(RUN_DIR)/api.pid)"; kill $$(cat $(RUN_DIR)/api.pid) || true; rm -f $(RUN_DIR)/api.pid; fi
	@if [ -f $(RUN_DIR)/web.pid ]; then echo "[free-ports] killing bg web pid $$(cat $(RUN_DIR)/web.pid)"; kill $$(cat $(RUN_DIR)/web.pid) || true; rm -f $(RUN_DIR)/web.pid; fi
	@# kill stray dev watchers (pnpm/tsx) that may respawn children
	@pkill -f "tsx\s+watch\s+src/server.ts" 2>/dev/null || true
	@pkill -f "node\s+.*apps/api/dist/server.js" 2>/dev/null || true
	@pkill -f "pnpm\s+.*--filter\s+@sakumon/api\s+dev" 2>/dev/null || true
	@port_list="$(API_PORT) $(WEB_PORT)"; \
	for port in $$port_list; do \
	  tries=6; \
	  while [ $$tries -gt 0 ]; do \
	    pids=$$(lsof -ti tcp:$$port 2>/dev/null || true); \
	    if [ -z "$$pids" ]; then break; fi; \
	    echo "[free-ports] kill $$port: $$pids"; \
	    kill $$pids || true; \
	    sleep 0.5; \
	    pids=$$(lsof -ti tcp:$$port 2>/dev/null || true); \
	    if [ -z "$$pids" ]; then break; fi; \
	    echo "[free-ports] kill -9 $$port: $$pids"; \
	    kill -9 $$pids || true; \
	    sleep 0.5; \
	    tries=$$((tries-1)); \
	  done; \
	  pids=$$(lsof -ti tcp:$$port 2>/dev/null || true); \
	  if [ -n "$$pids" ]; then echo "[free-ports] failed to free $$port (pids: $$pids)"; exit 2; fi; \
	done

nuke:
	@echo "[nuke] stopping background pids..."
	-@$(MAKE) stop
	@echo "[nuke] killing dev/watchers..."
	-@pkill -f "tsx\s+watch\s+src/server.ts" || true
	-@pkill -f "pnpm\s+.*--filter\s+@sakumon/api\s+dev" || true
	-@pkill -f "pnpm\s+.*--filter\s+@sakumon/web\s+dev" || true
	-@pkill -f "vite" || true
	-@pkill -f "node\s+.*apps/api/dist/server.js" || true
	@$(MAKE) free-ports

start: build-packages
	@$(MAKE) stop 2>/dev/null || true
	@$(MAKE) free-ports
	@echo "▶ API:  http://localhost:$(API_PORT)"
	@echo "▶ Web:  http://localhost:$(WEB_PORT)"
	@echo "(Ctrl+Cで停止)"
	PORT=$(API_PORT) pnpm --filter @sakumon/api --filter @sakumon/web --parallel dev

start-bg: build-packages free-ports
	@mkdir -p $(RUN_DIR) $(LOG_DIR)
	@nohup env PORT=$(API_PORT) pnpm --filter @sakumon/api dev > $(LOG_DIR)/api.log 2>&1 & echo $$! > $(RUN_DIR)/api.pid && echo "API pid: $$(cat $(RUN_DIR)/api.pid)"
	@nohup pnpm --filter @sakumon/web dev > $(LOG_DIR)/web.log 2>&1 & echo $$! > $(RUN_DIR)/web.pid && echo "Web pid: $$(cat $(RUN_DIR)/web.pid)"
	@echo "起動しました: API http://localhost:$(API_PORT) , Web http://localhost:$(WEB_PORT)"
	@echo "ログ: $(LOG_DIR)/*.log"

stop:
	@if [ -f $(RUN_DIR)/api.pid ]; then kill $$(cat $(RUN_DIR)/api.pid) || true; rm -f $(RUN_DIR)/api.pid; echo "API stopped"; fi
	@if [ -f $(RUN_DIR)/web.pid ]; then kill $$(cat $(RUN_DIR)/web.pid) || true; rm -f $(RUN_DIR)/web.pid; echo "Web stopped"; fi

status:
	@for s in api web; do \
	  if [ -f $(RUN_DIR)/$$s.pid ]; then \
	    pid=$$(cat $(RUN_DIR)/$$s.pid); \
	    if ps -p $$pid >/dev/null 2>&1; then echo "$$s: running (pid $$pid)"; else echo "$$s: not running (stale pid $$pid)"; fi; \
	  else echo "$$s: not started"; fi; \
	done

logs:
	@ls -1 $(LOG_DIR)/*.log 2>/dev/null || echo "ログがありません" 
	@echo "--- tail -f logs --- (Ctrl+Cで終了)"
	@tail -f $(LOG_DIR)/*.log

api:
	pnpm --filter @sakumon/api dev

web:
	pnpm --filter @sakumon/web dev

typecheck:
	pnpm typecheck

build:
	pnpm build

clean:
	rm -rf node_modules apps/**/node_modules packages/**/node_modules
	rm -rf apps/api/prisma/dev.db apps/api/prisma/migrations
