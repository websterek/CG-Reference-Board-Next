/**
 * ITEM_TYPES — registry of per-type contracts.
 *
 * Adding a new item type is a multi-file change spanning the three packages —
 * domain schema/registry entry, client renderer + tool, server endpoint if the
 * type crosses the network boundary (see board-core spec.md "Item type
 * registry" requirement).
 */

import type { BoardItem, ItemType, Point, Rect } from '../board';
import {
  DEFAULT_RECTANGLE_ATTRS,
  getRectangleBounds,
  isRectangleItem,
  RectangleAttrs,
  RectangleAttrsSchema,
  rectangleHitTest,
} from './rectangle';
import { ImageItemDefinition } from './image';
import type { ItemTypeDefinition } from './index';

export {
  isRectangleItem,
  RectangleAttrsSchema,
  getRectangleBounds,
  rectangleHitTest,
  DEFAULT_RECTANGLE_ATTRS,
};

export type { RectangleAttrs };

export const RectangleItemDefinition: ItemTypeDefinition<RectangleAttrs> = {
  type: 'rectangle' as ItemType,
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
} as const satisfies Record<ItemType, ItemTypeDefinition>;

export type KnownAttrs<R extends ItemType> = R extends 'rectangle'
  ? RectangleAttrs
  : R extends 'image'
  ? import('./image.js').ImageAttrs
  : never;
