/**
 * Domain board types — pure TS, framework-free.
 * See design.md §D1 (hybrid domain model) and AGENTS.md.
 */

import { z } from 'zod';

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

export type LayerKind = 'frame' | 'media' | 'overlay' | 'annotation';

export interface LayerKindMeta {
  readonly id: LayerId;
  readonly name: string;
  readonly kind: LayerKind;
  readonly order: number;
}

export const DEFAULT_LAYERS: ReadonlyArray<LayerKindMeta> = Object.freeze([
  { id: asLayerId('frames'), name: 'Frames', kind: 'frame', order: 0 },
  { id: asLayerId('media'), name: 'Media', kind: 'media', order: 1 },
  { id: asLayerId('overlay'), name: 'Overlay', kind: 'overlay', order: 2 },
  { id: asLayerId('annotations'), name: 'Annotations', kind: 'annotation', order: 3 },
]);

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
  kind: z.enum(['frame', 'media', 'overlay', 'annotation']),
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
    .refine(
      (val) => ['frames', 'media', 'overlay', 'annotations'].includes(val),
      { message: 'layerId must be one of: frames, media, overlay, annotations' },
    ),
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
