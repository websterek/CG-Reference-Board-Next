/**
 * collab-schema.ts — DOCUMENTED CONTRACT for the Yjs document structure.
 *
 * Per design.md §D1: this file declares the *shape* of a board's Y.Doc without
 * importing the Yjs runtime. The client adapter and the server Hocuspocus hooks
 * both reference this contract so they cannot drift.
 *
 * Document name: `board:{boardId}` (passed to Hocuspocus as the document name).
 *
 * Top-level shape (Y.Doc.getMap('root')):
 *   items:  Y.Map<itemId, Y.Map<...field-name, value>>
 *           Each item map has:
 *             - id:        string (matching its key)
 *             - type:      string ('rectangle' | 'image' | ...)
 *             - layerId:   string
 *             - x, y:      number          (DEPRECATED scalar form — see below)
 *             - pos:       Y.Map<{x: number, y: number}>  ← canonical position
 *             - width:     number
 *             - height:    number
 *             - rotation:  number
 *             - attrs:     Y.Map<string, unknown>
 *
 *   layers: Y.Array<Y.Map<{id, name, order, visible, locked}>>
 *           Ordered. Lower `order` = drawn behind higher `order`.
 *
 *   meta:   Y.Map<string, unknown>
 *           Board-level metadata (name, createdAt mirror). Not authoritative —
 *           the Fastify `boards` table is the source of truth.
 *
 * POSITION MODEL (D1 "torn-position fix"):
 *   The whole position is one LWW unit on conflict, NOT per-field scalar LWW.
 *   Clients MUST write item positions through `item.attrs.pos: Y.Map<{x, y}>`.
 *   Writing `item.attrs.x` and `item.attrs.y` independently is a bug
 *   (verified by Playwright two-browser concurrent drag test, task 12.12).
 */

import type { BoardId, ItemId, LayerId, LayerKind } from './board';

export const COLLAB_SCHEMA_VERSION = 1;

/**
 * Layer kinds (D3)
 * ----------------
 * Four fixed `LayerKind` values define the semantic layers of every board.
 * Each item type declares which kind it belongs to; the user never chooses.
 *
 *   kind          | stable ID      | z-order | snap      | overlap rule
 *   --------------|----------------|---------|-----------|----------------------
 *   `frame`       | `frames`       | 0 (bottom) | mandatory | frame ↔ frame forbidden
 *   `media`       | `media`        | 1        | mandatory | media ↔ media forbidden
 *   `overlay`     | `overlay`      | 2        | mandatory | overlay ↔ overlay forbidden
 *   `annotation`  | `annotations`  | 3 (top)  | off       | none
 *
 * Cross-layer overlap is always allowed. A frame may enclose media; an overlay
 * may sit on a media item; an annotation stroke may cross anything.
 *
 * Migration rule: legacy boards with a single `default` layer are migrated to
 * the four fixed layers on first load. All existing items are reassigned to
 * the `media` layer (since all current item types are media-kind).
 */
export const FIXED_LAYER_IDS = ['frames', 'media', 'overlay', 'annotations'] as const;
export type FixedLayerId = (typeof FIXED_LAYER_IDS)[number];

/** Top-level Y.Doc fields for a board document. */
export const COLLAB_TOP_LEVEL_KEYS = ['items', 'layers', 'meta'] as const;
export type CollabTopLevelKey = (typeof COLLAB_TOP_LEVEL_KEYS)[number];

/** Per-item Y.Map fields (excluding `pos`, which is a nested sub-map). */
export const ITEM_FIELDS = [
  'id',
  'type',
  'layerId',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'attrs',
] as const;
export type ItemField = (typeof ITEM_FIELDS)[number];

/**
 * Fields that are wrapped in nested Y.Maps rather than stored as scalars.
 * Position is nested to make the whole vector one LWW unit (D1).
 */
export const NESTED_ITEM_FIELDS = ['pos'] as const;
export type NestedItemField = (typeof NESTED_ITEM_FIELDS)[number];

/** Per-layer Y.Map fields inside the layers Y.Array. */
export const LAYER_FIELDS = ['id', 'name', 'order', 'visible', 'locked', 'kind'] as const;
export type LayerField = (typeof LAYER_FIELDS)[number];

/**
 * Type-level shape of the Y.Doc for a board. NOT a runtime instance — the
 * adapter uses this as a contract reference.
 *
 * The actual Yjs runtime types (Y.Map, Y.Array) are referenced by *name* here,
 * not imported, so this file has zero Yjs dependencies. Adapter code translates
 * between this shape and the runtime.
 */
export interface BoardDocShape {
  readonly items: ReadonlyMap<ItemId, ItemSubMap>;
  readonly layers: ReadonlyArray<LayerSubMap>;
  readonly meta: ReadonlyMap<string, unknown>;
}

export interface ItemSubMap {
  readonly id: ItemId;
  readonly type: string;
  readonly layerId: LayerId;
  readonly x: number;          // scalar mirror of pos.x (read-only convenience)
  readonly y: number;          // scalar mirror of pos.y
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly attrs: ReadonlyMap<string, unknown>;
}

export interface LayerSubMap {
  readonly id: LayerId;
  readonly name: string;
  readonly order: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly kind: LayerKind;
}

/**
 * Document name convention for Hocuspocus.
 *
 * The server uses `board:{boardId}` as the document name in onLoadDocument
 * hooks. The client passes the same name in the HocuspocusProvider config.
 */
export function boardDocName(boardId: BoardId): string {
  return `board:${boardId}`;
}
