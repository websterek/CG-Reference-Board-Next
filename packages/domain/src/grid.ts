/**
 * GridService — pure snap functions.
 * Lives in domain because snapping must be consistent between rendering and
 * collaboration writes; clients cannot "see" different snaps than the server
 * round-trips.
 */

import type { GridConfig, Point, Rect } from './board';

function snapScalar(value: number, origin: number, cellSize: number): number {
  const offset = value - origin;
  const snapped = Math.round(offset / cellSize) * cellSize;
  return snapped + origin;
}

/**
 * Pure-function grid service. Snap position is rounded to the nearest cell.
 */
export const GridService = {
  snapPoint(point: Point, config: GridConfig): Point {
    if (!config.snapEnabled) {
      return { x: point.x, y: point.y };
    }
    return {
      x: snapScalar(point.x, config.originX, config.cellSize),
      y: snapScalar(point.y, config.originY, config.cellSize),
    };
  },

  snapRect(rect: Rect, config: GridConfig): Rect {
    if (!config.snapEnabled) {
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    const snappedOrigin: Point = {
      x: snapScalar(rect.x, config.originX, config.cellSize),
      y: snapScalar(rect.y, config.originY, config.cellSize),
    };
    const snappedSize = GridService.snapSize(
      { width: rect.width, height: rect.height },
      config,
    );
    return {
      x: snappedOrigin.x,
      y: snappedOrigin.y,
      width: Math.max(snappedSize.width, config.cellSize),
      height: Math.max(snappedSize.height, config.cellSize),
    };
  },

  snapSize(
    size: { width: number; height: number },
    config: GridConfig,
  ): { width: number; height: number } {
    if (!config.snapEnabled) {
      return { width: size.width, height: size.height };
    }
    return {
      width: snapScalar(size.width, 0, config.cellSize),
      height: snapScalar(size.height, 0, config.cellSize),
    };
  },
} as const;
