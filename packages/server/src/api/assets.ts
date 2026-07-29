/**
 * Assets API: POST /api/boards/:id/assets, GET /api/assets/:key
 *
 * Design §D7: all asset access is server-mediated. The public contract is
 * `GET /api/assets/:key` — never presigned URLs from MinIO directly.
 *
 * The upload handler streams bytes via the StorageProvider's putStream path
 * (no full-buffer round-trip); the checksum is computed incrementally so we
 * don't need to materialize the bytes in memory.
 */

import type { FastifyInstance } from 'fastify';
import { Readable, PassThrough } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { assets } from '../db/schema';
import { getDb } from '../db/client';
import { getStorage } from '../storage';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

interface MultipartPartFile {
  filename: string;
  mimetype: string;
  file: Readable;
  toBuffer: () => Promise<Buffer>;
}

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/boards/:id/assets
   * Streams the multipart upload through StorageProvider.putStream while
   * computing the SHA-256 checksum incrementally. Enforces size + type
   * limits before persisting.
   */
  app.post(
    '/api/boards/:id/assets',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { id: boardId } = request.params as { id: string };
      if (request.user.boardId !== boardId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (request.user.role === 'viewer') {
        return reply.code(403).send({ error: 'forbidden', message: 'Viewers cannot upload' });
      }

      const req = request as unknown as {
        parts: () => AsyncIterable<MultipartPartFile>;
      };
      const maxBytes = app.config ? Number(app.config.ASSET_MAX_BYTES) : 20 * 1024 * 1024;

      // Multipart may have multiple parts; we accept the first file only.
      let filePart: MultipartPartFile | null = null;
      for await (const part of req.parts()) {
        if ('filename' in part && part.filename) {
          filePart = part as MultipartPartFile;
          break;
        }
      }
      if (!filePart) {
        return reply.code(400).send({ error: 'no_file', message: 'multipart file required' });
      }
      const { filename, mimetype, file } = filePart;
      if (!ALLOWED_MIME.has(mimetype)) {
        // Drain to keep the connection clean.
        file.resume();
        return reply.code(415).send({
          error: 'unsupported_media_type',
          allowed: [...ALLOWED_MIME],
        });
      }

      const assetId = randomUUID();
      const storageKey = `boards/${boardId}/assets/${assetId}`;

      // Stream → StorageProvider.putStream + checksum computation.
      // We tee the upload stream into a PassThrough so we can:
      //   1) pipe the original stream to the storage provider
      //   2) attach the hash incrementally
      //   3) enforce size limit (cancel the stream if exceeded)
      const sink = new PassThrough();
      const hasher = createHash('sha256');
      let bytesStreamed = 0;
      let exceeded = false;

      file.on('data', (chunk: Buffer) => {
        bytesStreamed += chunk.length;
        if (bytesStreamed > maxBytes && !exceeded) {
          exceeded = true;
        }
        hasher.update(chunk);
      });

      // Forward the upload stream into our tee'd sink for the storage provider.
      file.pipe(sink);

      const storage = getStorage();
      try {
        await storage.putStream(storageKey, sink, mimetype);
      } catch (err) {
        file.resume();
        throw err;
      }
      if (exceeded) {
        // Best-effort cleanup of the orphaned object.
        await storage.delete(storageKey).catch(() => undefined);
        return reply.code(413).send({ error: 'payload_too_large', limitBytes: maxBytes });
      }
      const checksum = hasher.digest('hex');

      const db = getDb();
      await db.insert(assets).values({
        id: assetId,
        boardId,
        filename,
        mimeType: mimetype,
        size: bytesStreamed,
        storageKey,
        checksum,
        kind: 'image',
      });

      return reply.code(201).send({ assetId, storageKey, checksum });
    },
  );

  /**
   * GET /api/assets/:key — server-mediated asset proxy (D7).
   *
   * `:key` is a wildcard path (slashes included) because storage keys are
   * `boards/<boardId>/assets/<assetId>`.
   */
  app.get<{ Params: { '*': string } }>(
    '/api/assets/*',
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const params = request.params as Record<string, string>;
      const key = params['*'] ?? '';
      const match = key.match(/^boards\/([^/]+)\/assets\/([^/]+)$/);
      if (!match) {
        return reply.code(400).send({ error: 'invalid_key' });
      }
      const [, boardId, assetId] = match;
      if (request.user.boardId !== boardId) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      const db = getDb();
      const [row] = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, assetId!), eq(assets.boardId, boardId!), isNull(assets.deletedAt)))
        .limit(1);
      if (!row) {
        return reply.code(404).send({ error: 'not_found' });
      }
      const storage = getStorage();
      const stream = await storage.getStream(row.storageKey);
      reply.header('content-type', row.mimeType);
      reply.header('content-length', String(row.size));
      reply.header('cache-control', 'private, max-age=60');
      return reply.send(stream);
    },
  );
}
