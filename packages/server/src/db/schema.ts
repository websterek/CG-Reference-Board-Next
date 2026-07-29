/**
 * Schema barrel — picks the active dialect's table definitions based on
 * `DATABASE_URL` at module-load time.
 *
 * The driver resolution is eager: at module-load, we read
 * `process.env.DATABASE_URL` and pick the matching per-dialect tables. If
 * the env is unset, `db/driver.ts` defaults to SQLite (`sqlite:./local.db`),
 * so importing this module never throws just because `DATABASE_URL` is
 * missing.
 *
 * The two per-dialect files (`schema.pg.ts`, `schema.sqlite.ts`) export
 * tables with identical names and structurally identical column shapes.
 *
 * Type strategy:
 *   - Tables are typed as the PG dialect (the production truth).
 *   - The SQLite runtime values are cast to the PG typed surface.
 *   - Row types come from the PG schema's `$inferSelect`.
 */

import { getDriverName } from './driver';

import * as pgSchema from './schema.pg.js';
import * as sqliteSchema from './schema.sqlite.js';

type PgSchema = typeof pgSchema;

const driver = getDriverName();
const active = (
  driver === 'sqlite' ? sqliteSchema : pgSchema
) as unknown as PgSchema;

export const boards = active.boards;
export const yjsDocuments = active.yjsDocuments;
export const assets = active.assets;
export const boardMembers = active.boardMembers;

export const memberRole: unknown =
  (active as unknown as { memberRole?: unknown }).memberRole ?? null;

export const memberRoleValues: readonly string[] =
  (active as unknown as { memberRoleValues?: readonly string[] })
    .memberRoleValues ?? ['owner', 'editor', 'viewer'];

export type BoardRow = typeof pgSchema.boards.$inferSelect;
export type NewBoardRow = typeof pgSchema.boards.$inferInsert;
export type AssetRow = typeof pgSchema.assets.$inferSelect;
export type BoardMemberRow = typeof pgSchema.boardMembers.$inferSelect;
export type YjsDocumentRow = typeof pgSchema.yjsDocuments.$inferSelect;