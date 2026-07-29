/**
 * Frame item — a visual container on the `frame` layer kind.
 * Frames are rectangles with no special attributes in v1; they serve as
 * visual markers that enclose media items (cross-layer overlap allowed).
 */

import { z } from 'zod';
import type { BoardItem, ItemType, Point, Rect } from '../board';
import type { ItemTypeDefinition } from './index';

export interface FrameAttrs {
  // No attributes for now; frames are purely visual markers.
}

export const FrameAttrsSchema = z.object({});

export const DEFAULT_FRAME_ATTRS: FrameAttrs = Object.freeze({});

export function isFrameItem(item: BoardItem): item is BoardItem & { attrs: FrameAttrs } {
  return item.type === 'frame' && FrameAttrsSchema.safeParse(item.attrs).success;
}

export const FrameItemDefinition: ItemTypeDefinition<FrameAttrs> = {
  type: 'frame' as ItemType,
  layerKind: 'frame' as const,
  schema: FrameAttrsSchema,
  defaultAttrs: DEFAULT_FRAME_ATTRS,
  defaultSize: { width: 200, height: 150 },
  getBounds(item: BoardItem): Rect {
    return { x: item.x, y: item.y, width: item.width, height: item.height };
  },
  hitTest(item: BoardItem, point: Point): boolean {
    return (
      point.x >= item.x &&
      point.x <= item.x + item.width &&
      point.y >= item.y &&
      point.y <= item.y + item.height
    );
  },
};
