/**
 * Vitest integration test for the SQLite path.
 *
 * Boots the Fastify server with a SQLite file (in a tmpdir), runs the
 * preboot migrations, creates a board, uploads an asset, and asserts the
 * asset round-trips through `/api/assets/:key`. Proves the zero-infra dev
 * loop works end-to-end without Postgres or Docker.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'gridboard-sqlite-'));
const LOCAL_STORAGE_DIR = join(tmp, 'uploads');
const localDbPath = join(tmp, 'local.db');

// Env must be set BEFORE the config / driver caches read it.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `sqlite:${localDbPath}`;
process.env.JWT_SECRET =
  'integration-test-jwt-secret-please-do-not-use-in-production';
process.env.STORAGE_BACKEND = 'local';
process.env.LOCAL_STORAGE_DIR = LOCAL_STORAGE_DIR;
process.env.HOST = '127.0.0.1';
// PORT omitted — Fastify picks a free port via `port: 0` below.
process.env.CORS_ORIGIN = 'http://localhost:5173';

// Imports happen after env setup so the driver cache picks up SQLite.
const { buildApp } = await import('../index.js');
const { runMigrations } = await import('../db/migrate.js');
const { SqliteYjsByteStore } = await import('../db/byteStore.js');
const { resetConfig } = await import('../config/env.js');
const { resetDriver } = await import('../db/driver.js');
const { closeDb, getSqlite } = await import('../db/client.js');
const { initStorage } = await import('../storage/index.js');

resetConfig();
resetDriver();

let app: Awaited<ReturnType<typeof buildApp>>;
let baseURL: string;

beforeAll(async () => {
  await runMigrations();
  initStorage({
    NODE_ENV: 'test',
    DATABASE_URL: `sqlite:${localDbPath}`,
    JWT_SECRET:
      'integration-test-jwt-secret-please-do-not-use-in-production',
    JWT_EXPIRES_IN: '30d',
    PORT: 1,
    HOST: '127.0.0.1',
    CORS_ORIGIN: 'http://localhost:5173',
    ASSET_MAX_BYTES: 20 * 1024 * 1024,
    HOCUSPOCUS_FLUSH_INTERVAL_MS: 100,
  });
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (typeof addr !== 'object' || !addr) throw new Error('no address');
  baseURL = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (app) await app.close();
  await closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

describe('SQLite dev loop', () => {
  it('GET /health returns 200', async () => {
    const res = await fetch(`${baseURL}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('POST /api/boards creates a board and persists into SQLite', async () => {
    const res = await fetch(`${baseURL}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'sqlite test' }),
    });
    expect(res.status).toBe(201);
    const { id, token } = (await res.json()) as { id: string; token: string };
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(token).toBeTypeOf('string');

    // Verify the row is actually in SQLite by reading via the client.
    const handle = getSqlite();
    expect(handle).not.toBeNull();
    const row = handle!
      .prepare('SELECT id, name FROM boards WHERE id = ?')
      .get(id) as { id: string; name: string } | undefined;
    expect(row?.id).toBe(id);
    expect(row?.name).toBe('sqlite test');

    // Upload an asset.
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'tiny.png');
    const upRes = await fetch(`${baseURL}/api/boards/${id}/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    expect(upRes.status).toBe(201);
    const { assetId } = (await upRes.json()) as { assetId: string };
    expect(assetId).toBeDefined();

    // Fetch the asset back through the server-mediated proxy.
    const getRes = await fetch(
      `${baseURL}/api/assets/boards/${id}/assets/${assetId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(getRes.status).toBe(200);
    const fetched = new Uint8Array(await getRes.arrayBuffer());
    expect(Array.from(fetched)).toEqual(Array.from(bytes));
  });

  it('round-trips a Yjs document through the SQLite byte-store', async () => {
    if (!getSqlite()) throw new Error('sqlite handle closed');
    // Insert a board row first because the yjs_documents.board_id column
    // has a NOT NULL FK reference to boards.id. The boardId we extract from
    // `board:{id}` (Hocuspocus convention) must match a real boards.id.
    const boardId = 'bytestore-test-board';
    getSqlite()!
      .prepare('INSERT OR IGNORE INTO boards (id, name) VALUES (?, ?)')
      .run(boardId, 'byte-store fixture');
    const store = new SqliteYjsByteStore(getSqlite()!);
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await store.store(`board:${boardId}`, bytes);
    const fetched = await store.fetch(`board:${boardId}`);
    expect(fetched).not.toBeNull();
    expect(Array.from(fetched!)).toEqual(Array.from(bytes));
  });
});