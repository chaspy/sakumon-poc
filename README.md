# sakumon-poc (作問PoC)

ローカル環境で動作する高校向けテスト自動生成PoC。入力→生成(7:3)→編集→採点支援→PDF出力を最短導線で体験できます。

■ クイックスタート（ローカル/SQLite）

最短（Make）

- `make setup`    依存・ENV・DB・シードまで自動実行
- `make start`    フォアグラウンド起動（API/WebのURLを表示）
- `make dev`      API(Web)同時起動（停止は Ctrl+C）
- `make start-bg` バックグラウンド起動（PID/ログ管理）
- `make free-ports` ポート占有プロセスをkillして解放（API_PORT/WEB_PORT）
- `make nuke`     残存のdev/watchersを包括的に停止→ポート解放（最後の手段）

手動で行う場合：

1) 依存関係インストール（Node.js 20系 / pnpm 9 系）
   - `pnpm i`

2) 環境変数

   - `.env` をルートに作成（`.env.sample`参照）
   - `OPENAI_API_KEY` を設定（埋め込みも利用）

3) DB初期化（SQLite + Prisma）

   - `pnpm --filter @sakumon/api prisma:generate`
   - `pnpm --filter @sakumon/api prisma:migrate`
   - `pnpm --filter @sakumon/api seed`（問題プールの最小データ投入）

4) 起動
   - `make start`（API: http://localhost:3031, Web: http://localhost:5183）
   - もしくは `pnpm dev` / `make dev`

■ 構成

- `apps/api` Express API（/api/*）
- `apps/web` Vite + React（最短導線UI）
- `packages/schemas` Zod/JSON Schema（Problemなど）
- `packages/workflows` 生成/検証/重複除去（OpenAI + Embedding）
- `packages/pdf` PDF出力（Puppeteer + MathJax）

■ 主要スクリプト

- ルート: `pnpm dev` / `pnpm build` / `pnpm typecheck`
- API: `pnpm --filter @sakumon/api dev`
- Web: `pnpm --filter @sakumon/web dev`

■ Make ターゲット

- `make setup` / `make start` / `make start-bg` / `make free-ports` / `make api` / `make web` / `make seed`
  - 既定ポート: API_PORT=3031 / WEB_PORT=5183（環境に合わせて上書き可）

■ 補足

- バンク置換API: `POST /api/worksheets/:id/replace { problemId, bankItemId }`
- バンク検索API: `POST /api/bank/search { subject, unit, tags? }`

■ 注意

- PoCのため観測SaaSは未接続。ログは最小限。
- PDFのMathJaxレンダはオンラインCDNに依存（オフライン時は簡易表示）。
