/**
 * Drizzle schema for GridBoard server.
 *
 * Tables:
 *   - boards:        board metadata (one row per board)
 *   - yjs_documents: binary Yjs document per board (BYTEA)
 *   - assets:        uploaded images/files (per-board)
 *   - board_members: durable grants (boardId, role) — even with no user
 *                    system, one owner row per board is inserted on creation
 *                    (design.md D9, task 3.5).
 *
 * The schema is the server-side truth for these tables; the Yjs document
 * binary is the source-of-truth for live board content.
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

// Drizzle has no built-in BYTEA in the pg-core bundle; declare it explicitly.
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
  // Document name (matches board:{boardId} convention from collab-schema.ts).
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
    /** Discriminator: rectangle | image | ... for client/server wiring. */
    kind: text('kind').notNull().default('image'),
    size: bigint('size', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum').notNull(),
    /** Future-proof: nullable until user accounts land (design.md D9). */
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
