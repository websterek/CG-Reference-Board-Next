/**
 * SQLite dialect schema (local dev only).
 *
 * Mirrors the Postgres schema in `schema.pg.ts` with SQLite-friendly types:
 *   - `bytea` -> `BLOB` (raw bytes)
 *   - `pgEnum` -> CHECK constraint with `text` column
 *   - `bigint` -> `integer` (drizzle-kit SQLite mode does not support bigint)
 *   - `timestamp with timezone` -> `integer` Unix epoch ms (drizzle's default
 *     for `timestamp` on SQLite, expressed via `{ mode: 'timestamp_ms' }`)
 *
 * The role discriminator is enforced via a CHECK clause so the same
 * `(boardId, role)` composite primary key works against SQLite.
 *
 * This module is consumed only via `db/index.ts` when the active
 * `DATABASE_URL` scheme is `sqlite:` (or `sqlite::memory:`).
 */

import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  primaryKey,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const ALLOWED_ROLES = ['owner', 'editor', 'viewer'] as const;
type MemberRole = (typeof ALLOWED_ROLES)[number];

export const memberRoleValues = ALLOWED_ROLES;

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const yjsDocuments = sqliteTable('yjs_documents', {
  name: text('name').primaryKey(),
  boardId: text('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  data: blob('data', { mode: 'buffer' }).notNull().default(sql`(x'')`),
  version: integer('version').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    kind: text('kind').notNull().default('image'),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum').notNull(),
    uploadedBy: text('uploaded_by'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    uniqKey: uniqueIndex('assets_storage_key_uniq').on(t.storageKey),
    boardIdx: index('assets_board_idx').on(t.boardId),
  }),
);

export const boardMembers = sqliteTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    role: text('role').$type<MemberRole>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.boardId, t.role] }),
    roleCheck: check(
      'board_members_role_check',
      sql`${t.role} IN ('owner', 'editor', 'viewer')`,
    ),
  }),
);

export type BoardRow = typeof boards.$inferSelect;
export type NewBoardRow = typeof boards.$inferInsert;
export type AssetRow = typeof assets.$inferSelect;
export type BoardMemberRow = typeof boardMembers.$inferSelect;
export type YjsDocumentRow = typeof yjsDocuments.$inferSelect;