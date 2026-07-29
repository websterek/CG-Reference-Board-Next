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
  | 'annotation-stroke';

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

export const ItemTypeSchema = z.enum(['rectangle', 'image', 'frame', 'annotation-stroke']);

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
