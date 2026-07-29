## Why

The first milestone shipped an end-to-end vertical slice but only 129/143 tasks
were complete — the remaining 14 are all infrastructure-bound verification tasks
(Docker compose up, browser-driven multi-user sync, Playwright 60 FPS test) that
require a working Docker daemon, Postgres, MinIO, and a real browser.

Two problems fall out of this:

1. **Iteration speed is poor.** Every code change today requires a `docker
   compose -f docker-compose.dev.yml up` cycle just to run `pnpm dev`. There is
   no path that lets a contributor open the repo, run `pnpm install && pnpm dev`,
   and see the app render.

2. **The Docker image has never actually been built.** The Dockerfile +
   compose file exist, but `docker compose up --build` was never exercised.
   The acceptance gate for the original milestone (task 12.17) is open.

This change closes both gaps. Phase 1 unlocks a Docker-free local dev loop
(SQLite + existing LocalStorage fallback). Phase 2 builds the Docker image,
runs `docker compose up --build`, and runs the deferred Playwright e2e suite
against the container — so the 14 outstanding tasks are exercised end-to-end.

## What Changes

- Add a SQLite Drizzle dialect alongside the existing Postgres dialect; select
  at boot time based on `DATABASE_URL` scheme (`sqlite:` vs `postgres://`).
  Production remains Postgres-only. **SQLite is local-dev only** — never
  promoted to production.
- Add a Vitest integration test that exercises the SQLite path against the
  same migration set used by Postgres, so we catch dialect drift early.
- Update `pnpm dev` scripts to start the server with a SQLite file
  (`./local.db`) when no Postgres is reachable.
- Build the production Docker image with `docker build` and verify it boots
  the Fastify server (`/health` returns 200) inside the container.
- Run `docker compose up --build` against the local Docker daemon; capture
  startup logs and assert all four services come up healthy.
- Run the Playwright e2e suite (`pnpm e2e`) against the compose stack and
  flip the 14 deferred tasks to `[x]` based on the outcome.
- Update `tasks.md` for the archived first-milestone change to reference
  this follow-up where appropriate (the archive itself stays immutable —
  the historical record of what was shipped).

No breaking changes to public APIs, schemas, or wire formats. The Hocuspocus
document name (`board:{id}`), JWT claim shape, and Drizzle table shapes
are unchanged.

## Capabilities

### New Capabilities
- `local-dev-environment`: SQLite-backed local development path; `pnpm dev`
  works without Docker. Documented runbook + tests.
- `docker-build-verification`: Reproducible Docker image build + smoke test
  (`/health` 200 inside the container). Runbook + CI gate.

### Modified Capabilities
- `deployment`: `docker compose up --build` verified end-to-end. Tasks 12.17
  and 12.18 promoted from "deferred" to "verified".

## Impact

**Affected code**
- `packages/server/src/db/index.ts` — branch on `DATABASE_URL` scheme;
  return `drizzle-orm/better-sqlite3` or `drizzle-orm/node-postgres`
- `packages/server/src/db/schema.ts` — column types must work for both
  dialects (or split via per-dialect re-exports). BYTEA → BLOB on SQLite.
- `packages/server/src/db/migrate.ts` — pick `drizzle-orm/better-sqlite3/migrator`
  vs `drizzle-orm/node-postgres/migrator` based on driver
- `packages/server/src/collab/hocuspocus.ts` — pg pool vs better-sqlite3
  statement usage in the Database extension
- `package.json` `dev` script — switch dev default to SQLite

**New dependencies**
- `better-sqlite3`, `@types/better-sqlite3`
- `drizzle-orm/better-sqlite3` (already pulled in via `drizzle-orm`)

**Affected systems**
- Local dev loop (now zero-infra)
- CI matrix (add a docker-build job)
- Documentation (`README.md` if it exists, otherwise create)

**Risk**
- Drizzle dialect differences: SQLite has no `bytea`; we use `BLOB`. Schema
  drift between PG (prod) and SQLite (dev) is the largest risk. Mitigation:
  integration test boots SQLite, runs the same migrations, and round-trips a
  Yjs document.
- Docker daemon availability: the second phase is blocked on the user
  having Docker installed locally. The change captures the steps; the run
  happens when the user runs it.