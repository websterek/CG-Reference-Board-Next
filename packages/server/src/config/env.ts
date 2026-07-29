/**
 * Server config — env-driven, validated once at boot.
 */

import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
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
  const parsed = Env.safeParse(process.env);
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
