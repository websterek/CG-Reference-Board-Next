/**
 * Rectangle item — extends BoardItem conceptually with rectangle-specific attrs.
 * Persisted as BoardItem with `type: 'rectangle'` and attrs: { fillColor, strokeColor, strokeWidth }.
 */

import { z } from 'zod';
import type { BoardItem, Rect } from '../board';

export interface RectangleAttrs {
  readonly fillColor: string;
  readonly strokeColor: string;
  readonly strokeWidth: number;
}

export const DEFAULT_RECTANGLE_ATTRS: RectangleAttrs = Object.freeze({
  fillColor: '#4A90D9',
  strokeColor: '#000000',
  strokeWidth: 2,
});

export const RectangleAttrsSchema = z.object({
  fillColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  strokeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  strokeWidth: z.number().nonnegative(),
});

/**
 * Type guard: narrows a BoardItem to one carrying rectangle attrs.
 */
export function isRectangleItem(item: BoardItem): item is BoardItem & { attrs: RectangleAttrs } {
  return item.type === 'rectangle' && RectangleAttrsSchema.safeParse(item.attrs).success;
}

/**
 * Rectangle bounds (rectangle rotation is rare in v1; assume axis-aligned).
 */
export function getRectangleBounds(item: BoardItem): Rect {
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };
}

/**
 * Hit test for axis-aligned rectangles.
 */
export function rectangleHitTest(item: BoardItem, point: { x: number; y: number }): boolean {
  return (
    point.x >= item.x &&
    point.x <= item.x + item.width &&
    point.y >= item.y &&
    point.y <= item.y + item.height
  );
}
