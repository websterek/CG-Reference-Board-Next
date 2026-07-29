/**
 * ITEM_TYPES — registry of per-type contracts.
 *
 * Adding a new item type is a multi-file change spanning the three packages —
 * domain schema/registry entry, client renderer + tool, server endpoint if the
 * type crosses the network boundary (see board-core spec.md "Item type
 * registry" requirement).
 */

import type { BoardItem, ItemType, LayerKind, LayerId, Point, Rect } from '../board';
import { DEFAULT_LAYERS } from '../board';
import {
  DEFAULT_RECTANGLE_ATTRS,
  getRectangleBounds,
  isRectangleItem,
  RectangleAttrs,
  RectangleAttrsSchema,
  rectangleHitTest,
} from './rectangle';
import { ImageItemDefinition } from './image';
import { FrameItemDefinition } from './frame';
import { AnnotationItemDefinition } from './annotation';
import type { ItemTypeDefinition } from './index';

export {
  isRectangleItem,
  RectangleAttrsSchema,
  getRectangleBounds,
  rectangleHitTest,
  DEFAULT_RECTANGLE_ATTRS,
};

export type { RectangleAttrs };

export {
  FrameItemDefinition,
  FrameAttrsSchema,
  DEFAULT_FRAME_ATTRS,
  isFrameItem,
} from './frame';
export type { FrameAttrs } from './frame';

export {
  AnnotationItemDefinition,
  AnnotationAttrsSchema,
  DEFAULT_ANNOTATION_ATTRS,
  isAnnotationItem,
  getAnnotationBounds,
} from './annotation';
export type { AnnotationAttrs } from './annotation';

export const RectangleItemDefinition: ItemTypeDefinition<RectangleAttrs> = {
  type: 'rectangle' as ItemType,
  layerKind: 'media' as const,
  schema: RectangleAttrsSchema,
  defaultAttrs: DEFAULT_RECTANGLE_ATTRS,
  defaultSize: { width: 80, height: 60 },
  getBounds(item: BoardItem): Rect {
    return getRectangleBounds(item);
  },
  hitTest(item: BoardItem, point: Point): boolean {
    return rectangleHitTest(item, point);
  },
};

export const ITEM_TYPES = {
  rectangle: RectangleItemDefinition,
  image: ImageItemDefinition,
  frame: FrameItemDefinition,
  'annotation-stroke': AnnotationItemDefinition,
} as const satisfies Record<ItemType, ItemTypeDefinition>;

export type KnownAttrs<R extends ItemType> = R extends 'rectangle'
  ? RectangleAttrs
  : R extends 'image'
  ? import('./image.js').ImageAttrs
  : R extends 'frame'
  ? import('./frame.js').FrameAttrs
  : R extends 'annotation-stroke'
  ? import('./annotation.js').AnnotationAttrs
  : never;

/**
 * Return the LayerKind for a given item type.
 */
export function layerKindFor(type: ItemType): LayerKind {
  return ITEM_TYPES[type].layerKind;
}

/**
 * Return the default layer ID for a given LayerKind.
 * Throws if no default layer matches the kind.
 */
export function defaultLayerIdFor(kind: LayerKind): LayerId {
  const meta = DEFAULT_LAYERS.find((m) => m.kind === kind);
  if (!meta) throw new Error(`No default layer for kind ${kind}`);
  return meta.id;
}
