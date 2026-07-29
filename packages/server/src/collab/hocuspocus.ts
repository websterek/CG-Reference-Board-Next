/**
 * Hocuspocus server mount + authentication.
 *
 * Per design.md D10, the Hocuspocus extension works against the existing
 * `yjs_documents` table — we plug a Database extension with `fetch`/`store`
 * callbacks that read/write binary blobs via a `YjsByteStore`.
 *
 * WebSocket handling: Hocuspocus is mounted INTO the Fastify HTTP server via
 * `@fastify/websocket` so the Fastify process owns the only listener on
 * PORT. Earlier versions called `server.listen()` standalone, which would
 * collide with Fastify on the same port — fixed by wiring the Fastify
 * `socket` to `hocuspocus.handleConnection(socket, request)`.
 *
 * Token verification happens in onAuthenticate (per Hocuspocus docs — the
 * correct hook for viewer enforcement).
 */

import type { FastifyInstance } from 'fastify';
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import * as Y from 'yjs';
import type { AppConfig } from '../config/env';
import type { YjsByteStore } from '../db/byteStore';
import {
  PgYjsByteStore,
  SqliteYjsByteStore,
} from '../db/byteStore';
import { getDriverName } from '../db/driver';
import { getSqlite } from '../db/client';
import type { WebSocket } from 'ws';

function buildDatabaseExtension(cfg: AppConfig): {
  extension: Database;
  store: YjsByteStore;
} {
  const driver = getDriverName();
  let store: YjsByteStore;
  if (driver === 'sqlite') {
    const handle = getSqlite();
    if (!handle) {
      throw new Error(
        '[collab] SQLite handle is not open. Did db/client.init() run?',
      );
    }
    store = new SqliteYjsByteStore(handle);
  } else {
    store = new PgYjsByteStore(cfg.DATABASE_URL);
  }

  const extension = new Database({
    fetch: async ({ documentName }) => {
      return store.fetch(documentName);
    },
    store: async ({ documentName, document }) => {
      const update = Y.encodeStateAsUpdate(document);
      await store.store(documentName, update);
    },
  });

  return { extension, store };
}

/**
 * Mount Hocuspocus into Fastify. Returns the Hocuspocus instance so callers
 * can destroy it during graceful shutdown.
 */
export async function mountCollab(
  app: FastifyInstance,
  cfg: AppConfig,
): Promise<typeof Server> {
  const { extension: databaseExtension } = buildDatabaseExtension(cfg);

  const server = Server.configure({
    name: 'gridboard-collab',
    // No port here — we mount into Fastify via handleConnection below.
    extensions: [databaseExtension],

    // Auth — verifies JWT and attaches boardId+role to context.
    async onAuthenticate({ token, documentName }) {
      if (!token) throw new Error('missing token');
      try {
        const payload = app.jwt.verify(token) as {
          boardId: string;
          role: 'owner' | 'editor' | 'viewer';
        };
        if (documentName !== `board:${payload.boardId}`) {
          throw new Error('token/document mismatch');
        }
        return {
          user: { boardId: payload.boardId, role: payload.role },
          readOnly: payload.role === 'viewer',
        };
      } catch {
        throw new Error('invalid token');
      }
    },

    async onChange({ documentName, context }) {
      const ctx = context as { user?: { role: string } } | undefined;
      app.log.debug({ documentName, role: ctx?.user?.role }, 'collab change');
    },

    async onConnect({ documentName, context }) {
      const ctx = context as { user?: { boardId: string; role: string } } | undefined;
      app.log.info({ documentName, boardId: ctx?.user?.boardId }, 'collab connect');
    },

    async onStoreDocument({ documentName }) {
      app.log.debug({ documentName }, 'collab stored');
    },

    debounce: cfg.HOCUSPOCUS_FLUSH_INTERVAL_MS,
  });

  app.get(
    '/collab',
    { websocket: true } as never,
    (socket: WebSocket, _req: unknown) => {
      const req = _req as unknown as import('node:http').IncomingMessage;
      server.handleConnection(socket, req);
    },
  );

  return server;
}