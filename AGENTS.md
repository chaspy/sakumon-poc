# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm; workspace manifests and Make targets live at the root alongside `.env.sample`.
- `apps/api`: Express + Prisma service exposing `/api/*`; schema lives in `apps/api/prisma`, seeds in `apps/api/src/seed.ts`.
- `apps/web`: Vite + React UI under `apps/web/src`, consuming generated PDFs from the API.
- Shared logic sits in `packages/schemas` (Zod DTOs), `packages/workflows` (AI + grading routines), and `packages/pdf` (PDF renderer); build them before running dependent apps.

## Build, Test, and Development Commands
- `make setup`: install dependencies, copy `.env`, run Prisma generate/migrate, seed baseline data.
- `make dev`: watch API and Web together; stop with `Ctrl+C`.
- `pnpm dev`: workspace-friendly alternative that rebuilds shared packages before starting both apps.
- `pnpm --filter @sakumon/api prisma:migrate`: apply schema changes after editing Prisma models or seeds.
- `pnpm --filter @sakumon/web build`: produce a production bundle to smoke-test UI regressions.

## Coding Style & Naming Conventions
- TypeScript with ES modules, two-space indentation, double quotes, and trailing semicolons as shown in `apps/api/src/server.ts`.
- Order imports core → third-party → workspace, keep helper functions adjacent to first usage, favor small pure utilities.
- Prisma models and React components use PascalCase; hooks/utilities stay camelCase. Run `pnpm -r typecheck` before pushing.

## Testing Guidelines
- No automated tests yet: validate flows manually via `make dev`, covering worksheet CRUD, OCR, grading, and PDF export.
- After schema edits, run `pnpm --filter @sakumon/api prisma:generate` and rerun seeds to confirm migrations succeed.
- Document manual checks (console output, screenshots, sample payloads) in PRs until formal tests arrive.

## Commit & Pull Request Guidelines
- Mirror Conventional Commit prefixes seen in history (`feat:`, `refactor:`); concise summaries may be Japanese or English.
- Keep commits focused, rebase noisy history, and reference related issues or tickets when they exist.
- PRs should describe the change, list validation steps, call out env or migration impacts, and attach UI/API evidence when relevant.

## Environment & Secrets
- Copy `.env.sample` to `.env` and set `OPENAI_API_KEY`; AI workflows, OCR, and grading depend on it.
- Use `make free-ports` or `make nuke` when lingering watchers block `API_PORT` (3031) or `WEB_PORT` (5183).
