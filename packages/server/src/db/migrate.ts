/**
 * Migration runner — applied as a preboot gate BEFORE the Fastify server
 * accepts connections (design.md D10, task 3.7, AGENTS.md deployment hygiene).
 *
 * Docker Compose `depends_on` for the app server must wait for migration
 * completion, not just Postgres health (task 3.9).
 *
 * Driver branching: SQLite vs Postgres. Each driver has its own migrations
 * folder (generated via the matching `drizzle-kit` invocation).
 */

import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { getDriverName } from './driver';

/** Per-driver migration folders. The convention is one folder per dialect. */
const PG_MIGRATIONS = './drizzle/migrations';
const SQLITE_MIGRATIONS = './drizzle/migrations-sqlite';

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; cannot run migrations');
  }

  const driver = getDriverName();

  if (driver === 'sqlite') {
    const path =
      connectionString === 'sqlite::memory:'
        ? ':memory:'
        : connectionString.slice('sqlite:'.length);
    const sqlite = new Database(path);
    sqlite.pragma('foreign_keys = ON');
    try {
      const db = drizzleSqlite(sqlite);
      await migrateSqlite(db, { migrationsFolder: SQLITE_MIGRATIONS });
      // eslint-disable-next-line no-console
      console.log('[migrations] SQLite Drizzle migrations applied');
      // Keep the handle alive for the Hocuspocus byte-store to pick up
      // later. Close() will run via `closeDb()` during graceful shutdown.
      // Must be awaited: `getSqlite()` in `collab/hocuspocus.ts` reads the
      // handle synchronously, and a non-awaited promise would let
      // `buildApp()` race the dynamic `./client.js` import.
      await registerSqliteForByteStore(sqlite);
    } catch (err) {
      sqlite.close();
      throw err;
    }
    return;
  }

  // Postgres path
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzlePg(pool);
    await migratePg(db, { migrationsFolder: PG_MIGRATIONS });
    // eslint-disable-next-line no-console
    console.log('[migrations] Postgres Drizzle migrations applied');
  } finally {
    await pool.end();
  }
}

/**
 * Register an already-open SQLite handle so that the Hocuspocus byte-store
 * can attach to it without opening a second connection. Imported lazily to
 * avoid a circular dependency between `db/migrate.ts` and `db/client.ts`.
 */
async function registerSqliteForByteStore(handle: Database.Database): Promise<void> {
  const mod = await import('./client.js');
  mod.registerSqlite(handle);
}