/**
 * Drizzle client factory — constructs the right drizzle instance per driver.
 *
 * SQLite path uses `better-sqlite3` (synchronous, file-based or :memory:).
 * Postgres path uses `pg.Pool` (asynchronous, pooled).
 *
 * The public `getDb()` return type is the Postgres drizzle instance because
 * routes don't differentiate between the two dialects (the table shapes
 * are structurally identical). Internally we cast the SQLite instance to
 * the PG type — runtime behavior is identical for the operations used
 * (insert/select/eq/and/isNull).
 */

import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { getDriverName } from './driver';
import * as schema from './schema';

let pgPool: Pool | null = null;
let sqliteDb: Database.Database | null = null;

function sqlitePathFromUrl(url: string): string {
  // Accept both `sqlite:./local.db` and `sqlite::memory:` (the url.spec way).
  if (url === 'sqlite::memory:') return ':memory:';
  return url.slice('sqlite:'.length);
}

function openPg(): Pool {
  if (!pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    pgPool = new Pool({ connectionString, max: 10 });
  }
  return pgPool;
}

function openSqlite(): Database.Database {
  if (!sqliteDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    sqliteDb = new Database(sqlitePathFromUrl(connectionString));
    // Reasonable defaults for a single-writer local dev DB.
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}

/** Public typed handle — Postgres dialect, used by route code. */
export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;

export function getDb(): DbClient {
  const driver = getDriverName();
  if (driver === 'sqlite') {
    // Cast through unknown — the table shapes are structurally compatible
    // and Drizzle's surface used by routes (insert/select) is identical.
    return drizzleSqlite(openSqlite(), {
      schema,
    }) as unknown as DbClient;
  }
  return drizzlePg(openPg(), { schema });
}

export async function closeDb(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

/** Test-only accessor used by the Hocuspocus byte-store wiring. */
export function getSqlite(): Database.Database | null {
  return sqliteDb;
}

export function getPgPool(): Pool | null {
  return pgPool;
}

/**
 * Adopt an already-open SQLite handle so that subsequent `getDb()` and
 * `getSqlite()` calls reuse it. Used by `db/migrate.ts` so the Hocuspocus
 * byte-store shares a single connection across the server lifetime.
 */
export function registerSqlite(handle: Database.Database): void {
  if (sqliteDb && sqliteDb !== handle) {
    sqliteDb.close();
  }
  sqliteDb = handle;
}