/**
 * Domain board types — pure TS, framework-free.
 * See design.md §D1 (hybrid domain model) and AGENTS.md.
 */

import { z } from 'zod';
import { tryGetLayerDef, getLayerIds } from './layers/registry';

// ----- IDs (branded via nominal typing) -----

export type BoardId = string & { readonly __brand: 'BoardId' };
export type ItemId = string & { readonly __brand: 'ItemId' };
export type LayerId = string & { readonly __brand: 'LayerId' };

export const asBoardId = (s: string): BoardId => s as BoardId;
export const asItemId = (s: string): ItemId => s as ItemId;
export const asLayerId = (s: string): LayerId => s as LayerId;

// ----- Geometry -----

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Point, Size {}

export type ItemType =
  | 'rectangle'
  | 'image'
  | 'frame'
  | 'annotation-stroke'
  | 'connector';

// ----- Layer kinds -----

/**
 * Open-ended layer kind identifier.
 *
 * The legacy closed union (`'frame' | 'media' | 'overlay' | 'annotation'`)
 * was replaced with `string` as part of the `layer-registry` change. The
 * set of valid kinds is now defined by the `LayerDefinition` registry
 * (see `packages/domain/src/layers/registry.ts`). Type safety is provided
 * at runtime via `getLayerDef(kind)`, which throws for unknown kinds.
 */
export type LayerKind = string;

// ----- Grid -----

export interface GridConfig {
  readonly cellSize: number;        // pixels (board coordinates)
  readonly subdivisions: number;    // minor lines per major (visual only)
  readonly originX: number;
  readonly originY: number;
  readonly snapEnabled: boolean;
}

export const DEFAULT_GRID_CONFIG: GridConfig = Object.freeze({
  cellSize: 20,
  subdivisions: 4,
  originX: 0,
  originY: 0,
  snapEnabled: true,
});

// ----- Camera -----

export interface CameraState {
  readonly x: number;     // pan offset in board coordinates
  readonly y: number;
  readonly zoom: number;  // 1.0 = 100%
}

export const DEFAULT_CAMERA: CameraState = Object.freeze({
  x: 0,
  y: 0,
  zoom: 1,
});

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

// ----- Layers -----

export interface Layer {
  readonly id: LayerId;
  readonly name: string;
  readonly order: number;    // sort order (lower = behind)
  readonly visible: boolean;
  readonly locked: boolean;
  readonly kind: LayerKind;
}

// ----- Items -----

export interface BoardItem {
  readonly id: ItemId;
  readonly type: ItemType;
  readonly x: number;        // board-coordinate position
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number; // radians
  readonly layerId: LayerId;
  readonly attrs: Readonly<Record<string, unknown>>;
}

// ----- Connector item -----

/**
 * Anchor for a connector endpoint. When `'auto'`, the anchor resolves
 * to the endpoint item's center at render time. When an explicit
 * `{ x, y }` is supplied, it is interpreted as an offset from the
 * item's top-left corner in board coordinates.
 */
export type ConnectorAnchor = 'auto' | { readonly x: number; readonly y: number };

/**
 * Style for a connector — stroke color, width, and arrowhead
 * configuration at the start and end of the path.
 */
export interface ConnectorStyle {
  readonly strokeColor: string;
  readonly strokeWidth: number;
  readonly arrowheadStart: 'none' | 'arrow';
  readonly arrowheadEnd: 'none' | 'arrow';
}

/**
 * Routing style for a connector. v1 implements only `'straight'`; the
 * other values are reserved for future implementation. The data model
 * accepts them so the schema does not need to migrate when those
 * routing styles are added.
 */
export type ConnectorRouting = 'straight' | 'orthogonal' | 'curved';

/**
 * Connector attributes — see connector-items spec.md for the full
 * requirements. Connectors bind to endpoint items by `ItemId` (NOT
 * embedded positions) so they follow their endpoints when items move,
 * and set `dangling: true` when an endpoint is deleted instead of
 * being cascade-deleted.
 *
 * The index signature is required for structural compatibility with
 * `BoardItem.attrs: Readonly<Record<string, unknown>>`. The named
 * fields describe the connector's semantic shape; the index signature
 * is a TypeScript-level concession to the base type.
 */
export interface ConnectorAttrs {
  readonly from: ItemId;
  readonly to: ItemId;
  readonly fromAnchor: ConnectorAnchor;
  readonly toAnchor: ConnectorAnchor;
  readonly waypoints: ReadonlyArray<Point>;
  readonly routing: ConnectorRouting;
  readonly style: ConnectorStyle;
  readonly dangling: boolean;
  readonly [key: string]: unknown;
}

/**
 * ConnectorItem — a first-class item type on the `connector` layer
 * kind. The `x`/`y`/`width`/`height` fields are the derived bounding
 * box of the rendered path (recomputed when endpoints or waypoints
 * change) and are used for spatial indexing and viewport culling. The
 * authoritative geometry is the path computed from `attrs.from`/
 * `attrs.to` endpoint positions and `attrs.waypoints` at render time.
 */
export interface ConnectorItem extends BoardItem {
  readonly type: 'connector';
  readonly layerKind: 'connector';
  readonly attrs: ConnectorAttrs;
}

// ----- Board -----

export interface Board {
  readonly id: BoardId;
  readonly name: string;
  readonly items: ReadonlyMap<ItemId, BoardItem>;
  readonly layers: ReadonlyArray<Layer>;
  readonly gridConfig: GridConfig;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

// ----- Zod schemas (mirrored from TS types for runtime validation) -----

export const GridConfigSchema = z.object({
  cellSize: z.number().positive(),
  subdivisions: z.number().int().positive(),
  originX: z.number(),
  originY: z.number(),
  snapEnabled: z.boolean(),
});

export const CameraStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z
    .number()
    .min(MIN_ZOOM)
    .max(MAX_ZOOM),
});

export const LayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int(),
  visible: z.boolean(),
  locked: z.boolean(),
  // Layer kind is an open-ended string validated against the registry
  // (see packages/domain/src/layers/registry.ts). This replaces the
  // previous hardcoded `z.enum(['frame', 'media', 'overlay', 'annotation'])`
  // so that new kinds registered at runtime are accepted without a schema
  // change.
  kind: z
    .string()
    .min(1)
    .refine((kind) => tryGetLayerDef(kind) !== undefined, {
      message: 'Unknown layer kind',
    }),
});

export const ItemTypeSchema = z.enum(['rectangle', 'image', 'frame', 'annotation-stroke', 'connector']);

export const BoardItemSchema = z.object({
  id: z.string().min(1),
  type: ItemTypeSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number(),
  layerId: z
    .string()
    .min(1)
    // Registry-driven layer ID validation. The allowed list is derived
    // from registered `LayerDefinition.layerId` values, so adding a new
    // kind to the registry automatically extends the valid set.
    .refine((val) => getLayerIds().includes(val), {
      message: 'layerId must be one of the registered layer IDs',
    }),
  attrs: z.record(z.string(), z.unknown()),
});

/**
 * Zod schema for `ConnectorAttrs` — mirrors the TypeScript interface
 * field-for-field. Validated at item-creation time and inside
 * `isConnectorItem` so a malformed connector cannot enter the board.
 *
 * The `from`/`to` fields are validated as plain non-empty strings
 * (not branded `ItemId`s) because Zod's `z.string()` returns a plain
 * string, not a branded `ItemId`. The brand is purely structural and
 * is established by `BoardItem.id: ItemId` upstream; runtime
 * validation here just confirms the string is non-empty.
 */
export const ConnectorAttrsSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  fromAnchor: z.union([
    z.literal('auto'),
    z.object({ x: z.number(), y: z.number() }),
  ]),
  toAnchor: z.union([
    z.literal('auto'),
    z.object({ x: z.number(), y: z.number() }),
  ]),
  waypoints: z.array(z.object({ x: z.number(), y: z.number() })),
  routing: z.enum(['straight', 'orthogonal', 'curved']),
  style: z.object({
    strokeColor: z.string(),
    strokeWidth: z.number().positive(),
    arrowheadStart: z.enum(['none', 'arrow']),
    arrowheadEnd: z.enum(['none', 'arrow']),
  }),
  dangling: z.boolean(),
});

/**
 * Default attribute values for a freshly-created `ConnectorItem`. The
 * `from`/`to` fields are intentionally left as empty strings because
 * they must be filled in by the creation tool (a connector is not
 * valid without endpoints). The cast to `ItemId` is safe because the
 * schema rejects empty strings at validation time — `DEFAULT_*` is
 * only used as a structural placeholder before the real values are
 * assigned.
 */
export const DEFAULT_CONNECTOR_ATTRS: ConnectorAttrs = Object.freeze({
  from: '' as unknown as ItemId,
  to: '' as unknown as ItemId,
  fromAnchor: 'auto',
  toAnchor: 'auto',
  waypoints: Object.freeze([]) as ReadonlyArray<Point>,
  routing: 'straight',
  style: Object.freeze({
    strokeColor: '#ffffff',
    strokeWidth: 2,
    arrowheadStart: 'none' as const,
    arrowheadEnd: 'arrow' as const,
  }),
  dangling: false,
});

export const BoardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Persisted as a record (items keyed by ID); runtime Board type uses Map for ergonomics.
  items: z.record(z.string(), BoardItemSchema),
  layers: z.array(LayerSchema),
  gridConfig: GridConfigSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
