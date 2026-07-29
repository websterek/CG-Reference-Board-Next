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
import type { AppConfig } from './config/env';

export async function buildApp(config?: AppConfig): Promise<Awaited<ReturnType<typeof Fastify>>> {
  const cfg = config ?? loadConfig();
  const app = Fastify({
    logger: { level: cfg.NODE_ENV === 'test' ? 'warn' : 'info' },
  });

  // Expose cfg to routes via decorate
  app.decorate('config', cfg);

  await app.register(cors, { origin: cfg.CORS_ORIGIN, credentials: true });
  await app.register(multipart, {
    limits: { fileSize: cfg.ASSET_MAX_BYTES },
  });
  await app.register(websocket, {
    // The server owns the only listener on PORT; mountCollab wires the
    // Hocuspocus handleConnection below.
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
}

// Run when invoked directly (tsx watch / prod start).
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  main().catch((err) => {
    console.error('[gridboard-server] fatal:', err);
    process.exit(1);
  });
}

// Augment FastifyInstance to know about our `config` decorator.
declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}
