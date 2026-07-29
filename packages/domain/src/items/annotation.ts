/**
 * Annotation stroke item — freehand drawing on the `annotation` layer kind.
 * Stores raw (unquantized) board-coordinate vertices. No overlap enforcement.
 */

import { z } from 'zod';
import type { BoardItem, ItemType, Point, Rect } from '../board';
import type { ItemTypeDefinition } from './index';

export interface AnnotationAttrs {
  readonly vertices: ReadonlyArray<Point>;
}

export const AnnotationAttrsSchema = z.object({
  vertices: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
    }),
  ),
});

export const DEFAULT_ANNOTATION_ATTRS: AnnotationAttrs = Object.freeze({
  vertices: [],
});

export function isAnnotationItem(
  item: BoardItem,
): item is BoardItem & { attrs: AnnotationAttrs } {
  return item.type === 'annotation-stroke' && AnnotationAttrsSchema.safeParse(item.attrs).success;
}

/**
 * Compute the bounding box of an annotation stroke from its vertices.
 */
export function getAnnotationBounds(item: BoardItem): Rect {
  const attrs = item.attrs as unknown as AnnotationAttrs;
  const verts = attrs.vertices ?? [];
  if (verts.length === 0) {
    return { x: item.x, y: item.y, width: item.width, height: item.height };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of verts) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export const AnnotationItemDefinition: ItemTypeDefinition<AnnotationAttrs> = {
  type: 'annotation-stroke' as ItemType,
  layerKind: 'annotation' as const,
  schema: AnnotationAttrsSchema,
  defaultAttrs: DEFAULT_ANNOTATION_ATTRS,
  defaultSize: { width: 0, height: 0 },
  getBounds(item: BoardItem): Rect {
    return getAnnotationBounds(item);
  },
  hitTest(item: BoardItem, point: Point): boolean {
    // Simple hit test: check if point is within the bounding box.
    // For a more accurate test, we'd check distance to each segment.
    const bounds = getAnnotationBounds(item);
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  },
};
