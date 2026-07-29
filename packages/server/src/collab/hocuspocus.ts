/**
 * Hocuspocus server mount + authentication.
 *
 * Per design.md D10, the Hocuspocus extension works against the existing
 * `yjs_documents` table — we plug a Database extension with `fetch`/`store`
 * arrow functions that read/write BYTEA via pg.
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
import pg from 'pg';
import * as Y from 'yjs';
import type { AppConfig } from '../config/env';
import type { WebSocket } from 'ws';

const { Pool } = pg;

function buildDatabaseExtension(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 4 });
  return new Database({
    fetch: async ({ documentName }) => {
      const { rows } = await pool.query(
        'SELECT data FROM yjs_documents WHERE name = $1',
        [documentName],
      );
      const r = rows[0];
      if (!r) return null;
      const buf = r.data as Buffer | null;
      if (!buf || buf.length === 0) return null;
      return new Uint8Array(buf);
    },
    store: async ({ documentName, document }) => {
      const update = Y.encodeStateAsUpdate(document);
      const data = Buffer.from(update);
      await pool.query(
        `INSERT INTO yjs_documents (name, data, version, updated_at)
         VALUES ($1, $2, 1, now())
         ON CONFLICT (name) DO UPDATE
           SET data = EXCLUDED.data,
               version = yjs_documents.version + 1,
               updated_at = now()`,
        [documentName, data],
      );
    },
  });
}

/**
 * Mount Hocuspocus into Fastify. Returns the Hocuspocus instance so callers
 * can destroy it during graceful shutdown.
 */
export async function mountCollab(
  app: FastifyInstance,
  cfg: AppConfig,
): Promise<typeof Server> {
  const server = Server.configure({
    name: 'gridboard-collab',
    // No port here — we mount into Fastify via handleConnection below.
    extensions: [buildDatabaseExtension(cfg.DATABASE_URL)],

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
      // Audit-only — viewer enforcement is via readOnly in onAuthenticate
      // (see design.md D9 / Hocuspocus docs).
      const ctx = context as { user?: { role: string } } | undefined;
      app.log.debug({ documentName, role: ctx?.user?.role }, 'collab change');
    },

    async onConnect({ documentName, context }) {
      // Surfaces verified context (from onAuthenticate) for downstream hooks.
      const ctx = context as { user?: { boardId: string; role: string } } | undefined;
      app.log.info({ documentName, boardId: ctx?.user?.boardId }, 'collab connect');
    },

    async onStoreDocument({ documentName }) {
      app.log.debug({ documentName }, 'collab stored');
    },

    debounce: cfg.HOCUSPOCUS_FLUSH_INTERVAL_MS,
  });

  // Mount under Fastify's WS endpoint so the same port serves HTTP + WS.
  // /collab is the path HocuspocusProvider connects to (see vite proxy +
  // the client's HocuspocusProvider url).
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
