## 1. SQLite dialect support

- [x] 1.1 Install `better-sqlite3` and `@types/better-sqlite3` in `packages/server`
- [x] 1.2 Split `packages/server/src/db/schema.ts` into `schema.pg.ts` and `schema.sqlite.ts`; re-export from `index.ts` based on driver
- [x] 1.3 Replace `pg.Pool` with a driver-agnostic `YjsByteStore` interface; add `PgYjsByteStore` and `SqliteYjsByteStore` implementations
- [x] 1.4 Update `db/migrate.ts` to branch on `DATABASE_URL` scheme (`sqlite:` vs `postgres://`) and pick the right drizzle-kit migrator + migrations folder
- [x] 1.5 Update `db/index.ts` to construct the right drizzle client per scheme
- [x] 1.6 Generate SQLite migrations via `drizzle-kit generate` for the SQLite schema

## 2. Driver-agnostic Hocuspocus wiring

- [x] 2.1 Refactor `packages/server/src/collab/hocuspocus.ts` to take a `YjsByteStore` instead of opening a `pg.Pool` directly
- [x] 2.2 Wire the SQLite vs Pg byte store selection in `index.ts` based on the active driver
- [x] 2.3 Update existing compose-validation tests to assert both compose files (no behavioral change)

## 3. Local-dev script + smoke test

- [x] 3.1 Update root `package.json` `dev` script so it doesn't require a running Postgres; SQLite is the default
- [x] 3.2 Update `packages/server/.env.example` (or `.env.example` at repo root) to point at a SQLite file by default
- [x] 3.3 Add `pnpm db:reset` script that deletes `./local.db` and re-runs migrations
- [x] 3.4 Add a Vitest integration test that boots the server with `DATABASE_URL=sqlite::memory:`, creates a board, uploads an asset, and asserts the asset is readable — proves the SQLite path works end-to-end without Docker

## 4. Compose smoke test

- [x] 4.1 Add `packages/server/src/__tests__/compose-boot.test.ts` that probes `docker info` and skips with a clear message if Docker is unavailable
- [x] 4.2 Test boots `docker compose up -d`, polls `/health` for up to 30s
- [x] 4.3 Test asserts the migrate sidecar completed successfully (`docker compose ps` shows exited-0)
- [x] 4.4 Test tears down with `docker compose down`
- [x] 4.5 Add `pnpm test:compose` script at root that runs only the compose test
- [x] 4.6 Add `compose-boot` to the Playwright fixture setup so the e2e suite can rely on the stack being up

## 5. Playwright e2e verification

- [x] 5.1 Start `docker compose up -d` and run `pnpm e2e`
- [x] 5.2 Fix any actual flakiness in the existing specs (`two-browser-sync`, `two-browser-concurrent-drag`, `cross-layer`, `1000-rect-fps`, `viewer-token`, `image-upload`)
- [x] 5.3 Add a tiny `tiny.png` fixture under `e2e/fixtures/` (1x1 PNG) so `image-upload.spec.ts` doesn't depend on a remote file
- [x] 5.4 Verify all six e2e specs pass against the compose stack

## 6. Mark follow-up tasks complete in the archive

- [x] 6.1 Update `openspec/changes/archive/2026-07-28-first-milestone-vertical-slice/tasks.md` to reference this change in the deferred-task notes (NOT to flip them — archives are immutable; the new tasks live in this change)

## 7. Documentation

- [x] 7.1 Create `README.md` at repo root with:
  - Quick start: `pnpm install && pnpm dev`
  - Docker path: `docker compose up --build`
  - E2E: `docker compose up -d && pnpm e2e`
- [x] 7.2 Document the SQLite vs Postgres driver switch in `README.md`
- [x] 7.3 Document where the local uploads + local.db live and how to reset them

## 8. Final verification

- [x] 8.1 `pnpm install` succeeds
- [x] 8.2 `pnpm -r typecheck` clean
- [x] 8.3 `pnpm -r test --no-bail` clean (domain + server + client)
- [x] 8.4 `pnpm dev` boots both server and client without any container
- [x] 8.5 `docker compose up --build` brings up the full stack (run on a Docker-enabled machine)
- [x] 8.6 `pnpm e2e` runs all six specs against the compose stack with all green