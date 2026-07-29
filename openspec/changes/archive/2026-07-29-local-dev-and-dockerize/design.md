## Context

The first milestone shipped with the server package hard-wired to `pg` and
Drizzle's `node-postgres` dialect. Production-only. Local dev currently needs
`docker compose -f docker-compose.dev.yml up` to get Postgres + MinIO before
`pnpm dev` will work. MinIO is already optional (LocalStorage fallback) but
Postgres is mandatory.

We need two distinct outcomes:

1. **Zero-infra dev loop.** A contributor should be able to clone, install,
   and run `pnpm dev` against a file-based database. No Docker, no
   background services.

2. **Production Docker image verified.** The Dockerfile + compose are
   written; we need to actually build and boot them and assert all four
   services (postgres, minio, server, client) come up healthy and
   communicate correctly.

Both share one constraint: the Yjs Hocuspocus extension currently opens a
`pg.Pool` directly. That coupling needs to be loosened so the
`fetch`/`store` callbacks in `Database.configure()` can talk to either
driver.

## Goals / Non-Goals

**Goals:**
- `pnpm dev` boots the server (SQLite) and client (Vite) without any
  container.
- The same migration set applies to both Postgres (prod) and SQLite (dev);
  dialect-specific bits isolated to per-driver adapter files.
- The Hocuspocus Database extension is driver-agnostic at the boundary
  (its `fetch`/`store` accept a small "byte-store" interface).
- `docker compose up --build` brings the full stack online; `/health`
  returns 200; the server's migrate sidecar exits 0 before the app
  service starts.
- The Playwright e2e suite (`pnpm e2e`) runs against the compose stack
  and the 12.11-12.16 + 12.17/12.18 tasks are verifiable.
- The 14 outstanding tasks from the first milestone get flipped to `[x]`
  where the verification succeeds.

**Non-Goals:**
- Production migration to SQLite (no — production stays on Postgres).
- Replacing MinIO with anything else (it works; the change is orthogonal).
- Dockerizing the dev loop (Phase 1 is intentionally Docker-free; the
  existing `docker-compose.dev.yml` becomes optional).
- Production hardening of the Docker image (rate limits, scanning, etc.
  — that's a future hardening milestone).
- Replacing Hocuspocus with a different CRDT server.
- Adding a CI pipeline (orthogonal to this slice).

## Decisions

### D1: SQLite via `better-sqlite3` for local dev

**Decision:** Use `better-sqlite3` (synchronous, embedded) with
`drizzle-orm/better-sqlite3` as the dev driver. Postgres stays for prod.
A factory at boot time branches on `DATABASE_URL` scheme.

**Rationale:** Zero-infra, fast (file-based), Drizzle has first-class
SQLite support, and the same migration files are portable with minor
tweaks (BYTEA → BLOB). The alternative (embedded-postgres) downloads a
~50MB native binary on first run, which doesn't match the "just `pnpm dev`"
ergonomic goal.

**Alternatives considered:**
- *embedded-postgres / pglite*: identical SQL surface, but slower first-run
  and a heavier dependency. Not worth the parity advantage when our schema
  is simple.
- *No DB (in-memory Maps)*: would force a stubbed API and break the Yjs
  persistence contract.

### D2: Per-dialect schema files

**Decision:** `packages/server/src/db/schema.ts` exports the canonical
shape (boards, yjs_documents, assets, board_members). The actual
drizzle-orm table definitions live in `schema.pg.ts` and `schema.sqlite.ts`,
each importing the same names and exporting a `pgTables` /
`sqliteTables` object. The schema index re-exports based on a build-time
constant or runtime driver detection.

**Rationale:** Drizzle's Postgres `bytea` and SQLite `blob` types are
incompatible at the type level — a single schema can't express both
without `any` casts. Splitting per-dialect keeps types honest.

**Alternatives considered:**
- *Single schema with `customType` polymorphism*: doable but every
  column needs a dialect adapter; doesn't scale as the schema grows.

### D3: Driver-agnostic "byte-store" interface for Hocuspocus

**Decision:** The Hocuspocus Database extension's `fetch`/`store` callbacks
talk to a small `YjsByteStore` interface (load by name → Uint8Array |
null; store by name → Uint8Array). Two implementations:
`PgYjsByteStore` (current `pg.Pool` code, refactored) and
`SqliteYjsByteStore` (better-sqlite3 statement). `mountCollab` picks based
on the active driver.

**Rationale:** Pulls the only pg-specific code out of `hocuspocus.ts`. The
extension already takes these callbacks as arrow functions in the
constructor, so the abstraction boundary is already there — we just
formalize it.

**Alternatives considered:**
- *Keep pg imports in hocuspocus.ts and branch on driver*: ugly. The
  whole point of `Database.configure({ fetch, store })` is that the
  extension is driver-agnostic.

### D4: Compose stack boot smoke test

**Decision:** A new Vitest test in `packages/server` boots the full
compose stack via `docker compose up -d`, polls `/health` for up to
30s, runs the existing API smoke (create board, fetch board, upload
asset), and tears down. Skipped automatically when Docker is unavailable
(via `docker info` probe).

**Rationale:** A runnable acceptance test for task 12.17 that doesn't
require a CI runner with Docker. The developer runs it manually; CI
runs it on every PR.

**Alternatives considered:**
- *CI-only test*: would leave the dev with no end-to-end smoke.
- *Shell-script-only test*: works but isn't wired into `pnpm` so easy
  to skip.

### D5: Phase 1 ships first, Phase 2 ships second

**Decision:** Task ordering: SQLite path + integration test + updated
`pnpm dev` script first. Compose smoke test + Playwright run second.
This ordering lets the developer iterate on Phase 2 against a verified
local stack.

**Rationale:** Phase 2's e2e tests need a known-good dev path to be
debuggable. Running e2e against the compose stack while the SQLite path
is broken would mean every failure could be either source.

**Alternatives considered:**
- *Parallel phases*: harder to debug if Phase 2 has a bug, because
  Phase 1 bugs would also surface.

### D6: No change to first-milestone archive

**Decision:** The archived `openspec/changes/archive/2026-07-28-first-milestone-vertical-slice/tasks.md`
stays as-is, with its 14 incomplete tasks. We do NOT modify it. The
follow-up work this change performs is its own new task list.

**Rationale:** OpenSpec archives are historical records. Editing them
would falsify what was actually shipped. Future readers looking at
"first-milestone" should see the exact state at archive time.

**Alternatives considered:**
- *Patch the archive to flip the now-verified tasks*: tempting, but
  breaks the contract that archives are immutable.

## Risks / Trade-offs

- **[Risk] Drizzle PG/SQLite dialect drift** — A migration written
  against the PG dialect might fail on SQLite (or vice versa).
  → **Mitigation:** Integration test boots SQLite, runs the same
  migrations, round-trips a Yjs document, and asserts the persisted
  binary matches the input. Block on this before Phase 2.

- **[Risk] BYTEA ↔ BLOB type mismatch in the application code** —
  `assets.storageKey` is a string, but `yjs_documents.data` is binary.
  Drizzle's `customType` already abstracts this in `schema.ts`. → **Mitigation:**
  Round-trip test (above) catches real regressions; per-dialect schema
  files keep types honest.

- **[Risk] `docker compose up` fails on first run due to networking**
  — Postgres healthcheck timing, MinIO bucket auto-creation, etc. →
  **Mitigation:** Compose smoke test runs against a fresh compose-down
  state; if it fails, the developer gets a clear error pointing at the
  compose file.

- **[Risk] Phase 2 requires Docker** — Some dev environments don't have
  it. → **Mitigation:** Phase 2 is gated behind a `docker info` probe;
  the test skips with a clear message if Docker is unavailable. Phase 1
  is the no-Docker fallback.

- **[Risk] Playwright e2e specs written in Phase 1 of first-milestone
  may be flaky** — earlier verification noted they were written but not
  run. → **Mitigation:** Run them, fix any actual flakiness, and only
  then flip tasks 12.12-12.16 to `[x]`. The follow-up change captures
  fixes as separate sub-tasks.

- **[Risk] Two migration folders (PG + SQLite)** — keeping migrations
  in lockstep is work. → **Mitigation:** Phase 1 starts with PG-only
  migrations. SQLite migrations are a separate folder generated by
  drizzle-kit's SQLite schema. We'll add a CI check that both migration
  sets apply cleanly.

## Migration Plan

No production migration. This change introduces a new dev-only path;
production continues to run Postgres. The deployment artifacts (Dockerfile,
docker-compose.yml) are unchanged.

Rollback: revert the change. Production deploys aren't affected.

## Open Questions

- Does the SQLite path need to support `prisma migrate dev`-style auto
  -generation, or is a one-time `pnpm db:generate` enough? (Defaulting to
  one-time; can add auto-gen if DX demands it.)
- Should the compose smoke test run as a separate `pnpm test:compose`
  or be merged into `pnpm test`? (Defaulting to separate so it can be
  gated on Docker availability.)
- For the Yjs binary round-trip on SQLite, should we use `Buffer` or
  `Uint8Array` as the in-memory representation? (Defaulting to `Buffer`
  for symmetry with the existing pg path; both are Node.js-native.)