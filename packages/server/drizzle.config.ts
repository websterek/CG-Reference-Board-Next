import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads this file for migrations.
 *
 * The `OPSDBCONFIG_DIALECT` env var chooses the dialect:
 *   - 'postgresql' (default) — emits migrations for `./drizzle/migrations`
 *   - 'sqlite'                — emits migrations for `./drizzle/migrations-sqlite`
 *
 * We don't pass a real `dbCredentials.url` here because drizzle-kit only
 * needs it for `migrate` and `push`. The `generate` command works purely
 * from the schema file, so a placeholder URL is fine.
 */
const dialect = (process.env.OPSX_DIALECT ?? 'postgresql') as
  | 'postgresql'
  | 'sqlite';

const out = dialect === 'sqlite' ? './drizzle/migrations-sqlite' : './drizzle/migrations';
const schema = dialect === 'sqlite' ? './src/db/schema.sqlite.ts' : './src/db/schema.pg.ts';

export default defineConfig({
  schema,
  out,
  dialect,
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      (dialect === 'sqlite'
        ? 'sqlite:./local.db'
        : 'postgres://gridboard:gridboard@localhost:5432/gridboard'),
  },
  strict: true,
  verbose: true,
});