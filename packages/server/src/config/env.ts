/**
 * Server config — env-driven, validated once at boot.
 */

import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  // Accept either a Postgres URL or a SQLite URL (`sqlite:./local.db`,
  // `sqlite::memory:`). The driver is selected at runtime by the scheme.
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (s) =>
        s.startsWith('postgres://') ||
        s.startsWith('postgresql://') ||
        s.startsWith('sqlite:'),
      'DATABASE_URL must be a postgres://, postgresql://, or sqlite: URL',
    ),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Asset upload limits */
  ASSET_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024), // 20 MB
  /** Hocuspocus */
  HOCUSPOCUS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
});

export type AppConfig = z.infer<typeof Env>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  // Apply dev-friendly defaults BEFORE validation so `pnpm dev` works
  // out of the box without exporting any env vars. Production deploys must
  // set both DATABASE_URL (postgres://…) and JWT_SECRET explicitly.
  //
  // We also write the defaults back to `process.env` so that downstream
  // modules which capture `process.env.DATABASE_URL` at import time (e.g.
  // the driver selector) see the resolved value.
  const env: Record<string, string | undefined> = { ...process.env };
  if (!env.DATABASE_URL) {
    env.DATABASE_URL = 'sqlite:./local.db';
    process.env.DATABASE_URL = env.DATABASE_URL;
  }
  if (!env.JWT_SECRET) {
    env.JWT_SECRET =
      'dev-only-jwt-secret-change-me-please-change-me-in-production-please-please-please';
    process.env.JWT_SECRET = env.JWT_SECRET;
  }
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    console.error('[config] env validation failed:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }
  cached = parsed.data;
  return cached;
}

/**
 * Convenience for tests / scripts: clear cache when mutating env.
 */
export function resetConfig(): void {
  cached = null;
}
