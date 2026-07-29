/**
 * Postgres dialect schema (production).
 *
 * Tables:
 *   - boards:        board metadata (one row per board)
 *   - yjs_documents: binary Yjs document per board (BYTEA)
 *   - assets:        uploaded images/files (per-board)
 *   - board_members: durable grants (boardId, role)
 *
 * The `bytea` column type is declared via Drizzle's `customType` because
 * `pg-core` doesn't ship a first-class BYTEA in this bundle.
 *
 * This module is consumed only via `db/index.ts` when the active
 * `DATABASE_URL` scheme is `postgres://` (or `postgresql://`).
 */

import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  customType,
  integer,
  bigint,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const memberRole = pgEnum('member_role', ['owner', 'editor', 'viewer']);

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const yjsDocuments = pgTable('yjs_documents', {
  name: text('name').primaryKey(),
  boardId: text('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  data: bytea('data').notNull().default(sql`\\x`),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    kind: text('kind').notNull().default('image'),
    size: bigint('size', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum').notNull(),
    uploadedBy: text('uploaded_by'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uniqKey: uniqueIndex('assets_storage_key_uniq').on(t.storageKey),
  }),
);

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.boardId, t.role] }),
  }),
);

export type BoardRow = typeof boards.$inferSelect;
export type NewBoardRow = typeof boards.$inferInsert;
export type AssetRow = typeof assets.$inferSelect;
export type BoardMemberRow = typeof boardMembers.$inferSelect;
export type YjsDocumentRow = typeof yjsDocuments.$inferSelect;