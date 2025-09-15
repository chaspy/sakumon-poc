# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

高校向けテスト自動生成PoC（Proof of Concept）。OpenAI APIを使用して問題を自動生成し、編集・採点支援・PDF出力まで一貫して提供するローカル環境向けシステム。

## Essential Commands

### Quick Start
```bash
make setup      # 依存関係インストール・環境変数・DB初期化・シードデータ投入まで一括実行
make start      # API(3031)とWeb(5183)をフォアグラウンドで起動
make dev        # 開発モード（ファイル監視）で起動
make start-bg   # バックグラウンドで起動
make stop       # バックグラウンドプロセスを停止
make free-ports # ポート占有プロセスを解放（デバッグ時）
make nuke       # 監視系プロセス強制終了とポート解放（最後の手段）
```

### Development Commands
```bash
# API開発
pnpm --filter @sakumon/api dev              # API起動（tsx watch）
pnpm --filter @sakumon/api prisma:generate  # Prismaクライアント生成
pnpm --filter @sakumon/api prisma:migrate   # DBマイグレーション
pnpm --filter @sakumon/api seed             # 問題バンクシードデータ投入

# Web開発
pnpm --filter @sakumon/web dev              # Vite開発サーバー起動

# 全体
pnpm typecheck                              # 全パッケージの型チェック
pnpm build                                   # 全パッケージビルド
```

### Testing Specific Features
```bash
# 特定パッケージのみビルド
pnpm --filter @sakumon/workflows build

# ログ確認（バックグラウンド起動時）
make logs
tail -f logs/api.log logs/web.log
```

## Architecture

### Monorepo Structure
pnpm workspaceによるmonorepo構成。パッケージ間の依存は `workspace:*` で解決。

### Core Packages

**apps/api** - Express APIサーバー
- `/api/generate` - OpenAI APIで問題生成（7:3比率制御、重複除去）
- `/api/worksheets/:id/problems` - ワークシート問題取得
- `/api/revise/:problemId` - 問題の部分改稿（prompt/choices/explanation）
- `/api/grade/mcq` - 選択問題採点
- `/api/grade/free` - 記述問題採点支援（ルーブリック評価）
- `/api/bank/search` - 問題バンク検索
- `/api/worksheets/:id/replace` - バンクから問題置換
- `/api/export/pdf` - PDF出力（解答用紙オプション付き）

**apps/web** - Vite + React UI
- 単一画面での最短導線実装
- 生成→編集→採点→PDF出力の一貫フロー

**packages/schemas** - Zod/JSON Schema定義
- Problem型定義（mcq/free、ルーブリック、難易度等）
- OpenAI structured output用JSON Schema生成

**packages/workflows** - ビジネスロジック
- `generate.ts` - 問題生成（教科別ヒント、埋め込みベクトル重複除去）
- `grade.ts` - 記述式採点ロジック
- `openai.ts` - OpenAI APIクライアント設定

**packages/pdf** - PDF生成
- Puppeteer + MathJax使用
- LaTeX数式対応（`y=ax+b`形式）

### Database
SQLite + Prisma ORM
- Worksheet: 問題セット管理
- Problem: 個別問題（JSON型でchoices/rubric等を格納）
- BankItem: 問題バンク（再利用可能な問題プール）

### Key Implementation Details

**問題生成フロー**
1. OpenAI structured outputで問題配列生成（厳格JSON Schema適用）
2. MCQ妥当性検証（4択確保、正解選択肢含有チェック）
3. 埋め込みベクトルによる重複検出（cosine similarity > 0.9）
4. DBへの永続化（position付きで順序管理）

**エラーハンドリング**
- 各APIエンドポイントで `{ok: boolean, data/error, meta: {traceId}}` 形式の統一レスポンス
- OpenAI API失敗時は安全側フォールバック（空配列返却等）

**ポート管理**
- API: `PORT` 環境変数（デフォルト3031）
- Web: Viteデフォルト5183
- Makefileで `API_PORT`/`WEB_PORT` 環境変数経由で上書き可能

## Environment Variables

`.env` ファイル必須項目:
- `OPENAI_API_KEY` - 問題生成と埋め込み計算に使用
- `DATABASE_URL` - SQLite接続文字列（デフォルト: `file:./dev.db`）
- `PDF_FONT_PATH` - PDF日本語フォントパス（オプション）

## Common Tasks

### 新規エンドポイント追加
1. `apps/api/src/server.ts` にルート追加
2. 必要に応じて `packages/workflows/src/` にビジネスロジック実装
3. Zodスキーマでリクエスト検証

### 問題タイプ追加
1. `packages/schemas/src/problem.ts` の `type` enum拡張
2. `packages/workflows/src/generate.ts` の生成プロンプト調整
3. UI側の `apps/web/src/ui/App.tsx` で表示対応

### デバッグ時のポート競合解決
```bash
make free-ports  # 通常はこれで解決
make nuke        # 強制的にすべて停止してポート解放
```