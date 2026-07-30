/**
 * Server entry point.
 *
 * Boot sequence (per design.md D10, task 3.7):
 *   1. Load + validate env config
 *   2. Run Drizzle migrations (preboot gate)
 *   3. Construct storage provider
 *   4. Build Fastify app
 *   5. Register plugins (cors, jwt, multipart, websocket)
 *   6. Register routes (boards, assets, health)
 *   7. Mount Hocuspocus on /collab
 *   8. listen()
 */

import { pathToFileURL } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { loadConfig } from './config/env';
import { runMigrations } from './db/migrate';
import { jwtPlugin } from './auth/jwt';
import { registerBoardRoutes } from './api/boards';
import { registerAssetRoutes } from './api/assets';
import { initStorage } from './storage';
import { mountCollab } from './collab/hocuspocus';
import { getDriverName } from './db/driver';
import type { AppConfig } from './config/env';

export async function buildApp(config?: AppConfig): Promise<Awaited<ReturnType<typeof Fastify>>> {
  const cfg = config ?? loadConfig();
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === 'test' ? 'warn' : 'info' },
  });

  app.decorate('config', cfg);

  await app.register(cors, { origin: cfg.CORS_ORIGIN, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: cfg.ASSET_MAX_BYTES },
  });
  await app.register(websocket, {
    options: { maxPayload: 1048576 },
  });
  await app.register(jwtPlugin, { config: cfg });

  registerBoardRoutes(app);
  registerAssetRoutes(app);
  await mountCollab(app, cfg);

  return app;
}

export async function main(): Promise<void> {
  const cfg = loadConfig();

  // 1. migrations (preboot)
  await runMigrations();

  // 2. storage
  initStorage(cfg);

  // 3. server
  const app = await buildApp(cfg);
  await app.listen({ port: cfg.PORT, host: cfg.HOST });
  // eslint-disable-next-line no-console
  console.log(`[gridboard-server] listening on http://${cfg.HOST}:${cfg.PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[gridboard-server] db driver: ${getDriverName()}`);
}

// Run when invoked directly (tsx watch / prod start).
// `process.argv[1]` is a raw OS path (backslashes + drive letters on Windows;
// bare relative under tsx), but `import.meta.url` is a file URL with
// forward-slashes and a triple-slash authority. Naive string concat only
// matches on POSIX with an absolute path. Resolve through `pathToFileURL`
// so the entry-point detection works on both platforms.
const entryArg = process.argv[1] ?? '';
const isEntry =
  import.meta.url === pathToFileURL(entryArg).href ||
  import.meta.url === `file://${entryArg}`;
if (isEntry) {
  main().catch((err) => {
    console.error('[gridboard-server] fatal:', err);
    process.exit(1);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}
