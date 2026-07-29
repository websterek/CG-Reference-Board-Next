/**
 * Driver selection — branches on the `DATABASE_URL` scheme.
 *
 * `sqlite:`        → SQLite (better-sqlite3, file-based or :memory:)
 * `postgres:` /
 * `postgresql:`    → Postgres (pg, production)
 *
 * If `DATABASE_URL` is unset, we default to SQLite (`sqlite:./local.db`)
 * — this matches the dev-friendly default in `loadConfig()` and lets the
 * schema barrel (`db/schema.ts`) resolve tables eagerly without requiring
 * a prior env materialization step.
 *
 * Production deploys must set `DATABASE_URL=postgres://…` explicitly. The
 * validation in `loadConfig()` will reject an unset `DATABASE_URL` in
 * production NODE_ENV via its refine check.
 */

export type DriverName = 'pg' | 'sqlite';

let cached: DriverName | null = null;

export function getDriverName(): DriverName {
  if (cached) return cached;
  let url = process.env.DATABASE_URL;
  if (!url) {
    // Default to SQLite for dev / unset env. Production code paths set
    // DATABASE_URL explicitly; tests can override via `process.env` before
    // any import that touches this module.
    url = 'sqlite:./local.db';
  }
  const scheme = url.split(':', 1)[0]?.toLowerCase();
  if (scheme === 'sqlite') {
    cached = 'sqlite';
  } else if (scheme === 'postgres' || scheme === 'postgresql') {
    cached = 'pg';
  } else {
    throw new Error(
      `[db] Unsupported DATABASE_URL scheme '${scheme}'. Expected 'sqlite:' or 'postgres://'.`,
    );
  }
  return cached;
}

/** Test-only — clear cache so env mutations take effect. */
export function resetDriver(): void {
  cached = null;
}