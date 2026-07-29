/**
 * Driver-agnostic byte-store for Hocuspocus Yjs documents.
 *
 * The Hocuspocus `Database.configure({ fetch, store })` extension already
 * takes plain callbacks; this module formalizes that boundary as a typed
 * interface with two implementations:
 *
 *   - `PgYjsByteStore` — current Postgres path (refactored out of
 *     `hocuspocus.ts`).
 *   - `SqliteYjsByteStore` — `better-sqlite3` prepared statements.
 *
 * The interface is intentionally tiny: load by name → bytes or null,
 * store by name → bytes. Anything more (locking, version bumps) lives in the
 * concrete implementations.
 */

import { Pool } from 'pg';
import type BetterSqlite3 from 'better-sqlite3';

export interface YjsByteStore {
  /** Return the persisted Yjs update for `documentName`, or null if absent. */
  fetch(documentName: string): Promise<Uint8Array | null>;
  /** Persist the Yjs update for `documentName`. Idempotent overwrite. */
  store(documentName: string, data: Uint8Array): Promise<void>;
  /** Release underlying resources. Safe to call multiple times. */
  close(): Promise<void>;
}

/**
 * Postgres implementation. Wraps a `pg.Pool`; the Hocuspocus extension
 * previously opened the pool inline — that responsibility now lives here.
 */
export class PgYjsByteStore implements YjsByteStore {
  private readonly pool: Pool;
  private readonly upsert: { text: string };
  private readonly select: { text: string };

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 4 });
    this.upsert = {
      text: `INSERT INTO yjs_documents (name, data, version, updated_at)
             VALUES ($1, $2, 1, now())
             ON CONFLICT (name) DO UPDATE
               SET data = EXCLUDED.data,
                   version = yjs_documents.version + 1,
                   updated_at = now()`,
    };
    this.select = {
      text: 'SELECT data FROM yjs_documents WHERE name = $1',
    };
  }

  async fetch(documentName: string): Promise<Uint8Array | null> {
    const { rows } = await this.pool.query(this.select.text, [documentName]);
    const r = rows[0] as { data: Buffer | null } | undefined;
    if (!r) return null;
    const buf = r.data;
    if (!buf || buf.length === 0) return null;
    return new Uint8Array(buf);
  }

  async store(documentName: string, data: Uint8Array): Promise<void> {
    await this.pool.query(this.upsert.text, [
      documentName,
      Buffer.from(data),
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * SQLite implementation. Uses prepared statements on the shared
 * `better-sqlite3` instance opened by `db/client.ts`.
 *
 * SQLite writes are synchronous; we expose an async surface for parity
 * with `PgYjsByteStore` (callers can `await` both uniformly).
 */
export class SqliteYjsByteStore implements YjsByteStore {
  private readonly upsert: BetterSqlite3.Statement;
  private readonly select: BetterSqlite3.Statement;
  private ownsHandle: BetterSqlite3.Database | null;

  constructor(db: BetterSqlite3.Database, ownsHandle = false) {
    this.ownsHandle = ownsHandle ? db : null;
    this.upsert = db.prepare(
      `INSERT INTO yjs_documents (name, board_id, data, version, updated_at)
       VALUES (?, ?, ?, 1, CAST((unixepoch() * 1000) AS INTEGER))
       ON CONFLICT(name) DO UPDATE SET
         data = excluded.data,
         version = (SELECT version FROM yjs_documents WHERE name = ?) + 1,
         updated_at = CAST((unixepoch() * 1000) AS INTEGER)`,
    );
    this.select = db.prepare(
      'SELECT data FROM yjs_documents WHERE name = ?',
    );
  }

  async fetch(documentName: string): Promise<Uint8Array | null> {
    const row = this.select.get(documentName) as { data: Buffer } | undefined;
    if (!row) return null;
    if (!row.data || row.data.length === 0) return null;
    return new Uint8Array(row.data);
  }

  async store(documentName: string, data: Uint8Array): Promise<void> {
    // Contract: `documentName` is `board:{boardId}` (set by Hocuspocus in
    // hocuspocus.ts → onAuthenticate, where documentName is matched against
    // `board:${payload.boardId}`). The `yjs_documents.board_id` column has a
    // NOT NULL FK reference to `boards.id`, so we extract the boardId from
    // the document name. The board row is expected to exist before
    // Hocuspocus stores the doc (Hocuspocus only connects to a board that
    // was previously created via POST /api/boards).
    //
    // If you change the document-name shape, update both this file and
    // hocuspocus.ts:onAuthenticate so the FK insert keeps working.
    const boardId = documentName.startsWith('board:')
      ? documentName.slice('board:'.length)
      : null;
    this.upsert.run(documentName, boardId, Buffer.from(data), documentName);
  }

  async close(): Promise<void> {
    if (this.ownsHandle) {
      this.ownsHandle.close();
      this.ownsHandle = null;
    }
  }
}