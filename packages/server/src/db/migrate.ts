/**
 * Migration runner — applied as a preboot gate BEFORE the Fastify server
 * accepts connections (design.md D10, task 3.7, AGENTS.md deployment hygiene).
 *
 * Docker Compose `depends_on` for the app server must wait for migration
 * completion, not just Postgres health (task 3.9).
 *
 * Strategy: bootstrap migration infra at runtime, run pending migrations, then
 * resolve. The companion CLI script (`bin/migrate.ts`) is the standalone path
 * used by the docker-compose `migrate` sidecar in dev/prod Dockerfiles.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; cannot run migrations');
  }
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle/migrations' });
    // eslint-disable-next-line no-console
    console.log('[migrations] Drizzle migrations applied');
  } finally {
    await pool.end();
  }
}
