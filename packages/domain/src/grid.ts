/**
 * GridService — pure snap functions.
 * Lives in domain because snapping must be consistent between rendering and
 * collaboration writes; clients cannot "see" different snaps than the server
 * round-trips.
 */

import type { GridConfig, LayerKind, Point, Rect } from './board';

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

  /**
   * Quantize a rect to cell boundaries. Same behavior as snapRect;
   * the name makes the intent explicit for the write-boundary invariant.
   */
  quantizeRect(rect: Rect, config: GridConfig): Rect {
    return GridService.snapRect(rect, config);
  },

  /**
   * Return the cell index for a board-coordinate value.
   */
  cellIndex(value: number, origin: number, cellSize: number): number {
    return Math.round((value - origin) / cellSize);
  },

  /**
   * Return the board-coordinate rect for a given cell (row, col).
   */
  cellBounds(
    row: number,
    col: number,
    cellSize: number,
    originX: number,
    originY: number,
  ): Rect {
    return {
      x: originX + col * cellSize,
      y: originY + row * cellSize,
      width: cellSize,
      height: cellSize,
    };
  },

  /**
   * Check whether a rect can be placed without overlapping any item of the
   * same layer kind. Returns false if any same-kind item intersects `rect`.
   *
   * @param rect   The proposed placement rect (board coords).
   * @param items  Iterable of items with id, bounds, and layerKind.
   * @param kind   The layer kind to check against.
   * @param excludeId  Optional item ID to exclude from the check (the item being moved).
   */
  canPlace(
    rect: Rect,
    items: Iterable<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: LayerKind;
    }>,
    kind: LayerKind,
    excludeId?: string,
  ): boolean {
    for (const item of items) {
      if (item.layerKind !== kind) continue;
      if (excludeId !== undefined && item.id === excludeId) continue;
      // Open-interval overlap test
      if (
        rect.x < item.x + item.width &&
        rect.x + rect.width > item.x &&
        rect.y < item.y + item.height &&
        rect.y + rect.height > item.y
      ) {
        return false;
      }
    }
    return true;
  },

  /**
   * Search for free cells near a rect. Returns candidate rects sorted by
   * distance from the original rect's center.
   *
   * @param rect   The original rect (board coords).
   * @param items  Iterable of items to check against.
   * @param kind   The layer kind to check against.
   * @param excludeId  Optional item ID to exclude.
   * @param options  Optional: radius (default 8), cellSize (default 20).
   */
  findFreeCells(
    rect: Rect,
    items: Iterable<{
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layerKind: LayerKind;
    }>,
    kind: LayerKind,
    excludeId?: string,
    options?: { radius?: number; cellSize?: number },
  ): Rect[] {
    const radius = options?.radius ?? 8;
    const cellSize = options?.cellSize ?? 20;
    const origCenterX = rect.x + rect.width / 2;
    const origCenterY = rect.y + rect.height / 2;
    const candidates: Rect[] = [];

    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const candidate: Rect = {
          x: rect.x + dc * cellSize,
          y: rect.y + dr * cellSize,
          width: rect.width,
          height: rect.height,
        };
        if (GridService.canPlace(candidate, items, kind, excludeId)) {
          candidates.push(candidate);
        }
      }
    }

    // Sort by squared Euclidean distance of center to original center
    candidates.sort((a, b) => {
      const da =
        (a.x + a.width / 2 - origCenterX) ** 2 +
        (a.y + a.height / 2 - origCenterY) ** 2;
      const db =
        (b.x + b.width / 2 - origCenterX) ** 2 +
        (b.y + b.height / 2 - origCenterY) ** 2;
      return da - db;
    });

    return candidates;
  },
} as const;
