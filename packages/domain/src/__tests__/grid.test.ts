import { describe, it, expect } from 'vitest';
import { GridService } from '../grid';
import { DEFAULT_GRID_CONFIG, type LayerKind } from '../board';

describe('GridService', () => {
  it('snapPoint rounds to nearest cell', () => {
    const snapped = GridService.snapPoint({ x: 23, y: 47 }, DEFAULT_GRID_CONFIG);
    expect(snapped).toEqual({ x: 20, y: 40 });
  });

  it('snapPoint is a no-op when snapEnabled is false', () => {
    const cfg = { ...DEFAULT_GRID_CONFIG, snapEnabled: false };
    const snapped = GridService.snapPoint({ x: 23, y: 47 }, cfg);
    expect(snapped).toEqual({ x: 23, y: 47 });
  });

  it('snapRect honors minimum size of one cell', () => {
    const snapped = GridService.snapRect(
      { x: 12, y: 12, width: 5, height: 9 },
      DEFAULT_GRID_CONFIG,
    );
    // origin snapped to grid, size snapped + bumped to at least cellSize
    expect(snapped).toEqual({ x: 20, y: 20, width: 20, height: 20 });
  });

  it('snapSize snaps to cellSize multiples', () => {
    const snapped = GridService.snapSize({ width: 33, height: 47 }, DEFAULT_GRID_CONFIG);
    expect(snapped).toEqual({ width: 40, height: 40 });
  });

  it('respects custom cellSize', () => {
    const snapped = GridService.snapPoint(
      { x: 11, y: 22 },
      { ...DEFAULT_GRID_CONFIG, cellSize: 50 },
    );
    expect(snapped).toEqual({ x: 0, y: 0 });
  });

  // ----- quantizeRect -----

  it('quantizeRect returns a cell-multiple rect', () => {
    const result = GridService.quantizeRect(
      { x: 23, y: 47, width: 33, height: 55 },
      DEFAULT_GRID_CONFIG,
    );
    expect(result.x % DEFAULT_GRID_CONFIG.cellSize).toBe(0);
    expect(result.y % DEFAULT_GRID_CONFIG.cellSize).toBe(0);
    expect(result.width % DEFAULT_GRID_CONFIG.cellSize).toBe(0);
    expect(result.height % DEFAULT_GRID_CONFIG.cellSize).toBe(0);
  });

  it('quantizeRect is a no-op when snapEnabled is false', () => {
    const cfg = { ...DEFAULT_GRID_CONFIG, snapEnabled: false };
    const rect = { x: 23, y: 47, width: 33, height: 55 };
    const result = GridService.quantizeRect(rect, cfg);
    expect(result).toEqual(rect);
  });

  // ----- cellIndex -----

  it('cellIndex returns rounded cell index', () => {
    expect(GridService.cellIndex(23, 0, 20)).toBe(1); // 23/20 = 1.15 → round → 1
    expect(GridService.cellIndex(30, 0, 20)).toBe(2); // 30/20 = 1.5 → round → 2
    expect(GridService.cellIndex(-15, 0, 20)).toBe(-1); // -15/20 = -0.75 → round → -1
    expect(GridService.cellIndex(0, 0, 20)).toBe(0);
  });

  it('cellIndex respects origin', () => {
    // value 50, origin 10, cellSize 20 → (50-10)/20 = 2
    expect(GridService.cellIndex(50, 10, 20)).toBe(2);
  });

  // ----- cellBounds -----

  it('cellBounds returns correct board-coord rect', () => {
    const rect = GridService.cellBounds(2, 3, 20, 0, 0);
    expect(rect).toEqual({ x: 60, y: 40, width: 20, height: 20 });
  });

  it('cellBounds round-trips with cellIndex', () => {
    const cellSize = 20;
    const originX = 0;
    const originY = 0;
    const value = 45;
    const idx = GridService.cellIndex(value, originX, cellSize);
    const bounds = GridService.cellBounds(0, idx, cellSize, originX, originY);
    // The snapped value should be at the cell origin
    expect(bounds.x).toBe(40); // cellIndex(45,0,20) = 2 → cellBounds(0,2,20,0,0).x = 40
  });

  // ----- canPlace -----

  const mkItem = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    layerKind: LayerKind,
  ) => ({ id, x, y, width: w, height: h, layerKind });

  it('canPlace returns true when no same-kind items overlap', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 40, y: 40, width: 20, height: 20 };
    expect(GridService.canPlace(rect, items, 'media')).toBe(true);
  });

  it('canPlace returns false when same-kind items overlap', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(GridService.canPlace(rect, items, 'media')).toBe(false);
  });

  it('canPlace allows cross-layer overlap (frame over media)', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(GridService.canPlace(rect, items, 'frame')).toBe(true);
  });

  it('canPlace allows cross-layer overlap (media over frame)', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'frame')];
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(GridService.canPlace(rect, items, 'media')).toBe(true);
  });

  it('canPlace excludes specified id', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    // Without exclusion, this would overlap
    expect(GridService.canPlace(rect, items, 'media', 'a')).toBe(true);
  });

  it('canPlace returns false for frame↔frame overlap', () => {
    const items = [mkItem('f1', 0, 0, 40, 40, 'frame')];
    const rect = { x: 20, y: 20, width: 40, height: 40 };
    expect(GridService.canPlace(rect, items, 'frame')).toBe(false);
  });

  it('canPlace returns false for overlay↔overlay overlap', () => {
    const items = [mkItem('o1', 0, 0, 40, 40, 'overlay')];
    const rect = { x: 20, y: 20, width: 40, height: 40 };
    expect(GridService.canPlace(rect, items, 'overlay')).toBe(false);
  });

  it('canPlace ignores annotation items (no overlap check for annotations)', () => {
    // Annotations have no overlap invariant, but canPlace still checks same-kind.
    // Two annotations overlapping should return false (same-kind check applies).
    const items = [mkItem('ann1', 0, 0, 40, 40, 'annotation')];
    const rect = { x: 20, y: 20, width: 40, height: 40 };
    expect(GridService.canPlace(rect, items, 'annotation')).toBe(false);
  });

  // ----- findFreeCells -----

  it('findFreeCells returns candidates sorted by distance', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const candidates = GridService.findFreeCells(rect, items, 'media', undefined, {
      radius: 2,
      cellSize: 20,
    });
    expect(candidates.length).toBeGreaterThan(0);
    // The first candidate should be the closest free cell
    // With item at (0,0,20,20), the rect at (0,0,20,20) overlaps.
    // Nearest free cell should be offset by 1 cell in some direction.
    const first = candidates[0]!;
    // Verify it doesn't overlap with item 'a'
    const overlaps =
      first.x < 20 && first.x + first.width > 0 && first.y < 20 && first.y + first.height > 0;
    expect(overlaps).toBe(false);
  });

  it('findFreeCells respects excludeId', () => {
    const items = [mkItem('a', 0, 0, 20, 20, 'media')];
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    // Without exclusion, the original position is occupied
    const withoutExclusion = GridService.findFreeCells(rect, items, 'media', undefined, {
      radius: 1,
      cellSize: 20,
    });
    // With exclusion, the original position should be free
    const withExclusion = GridService.findFreeCells(rect, items, 'media', 'a', {
      radius: 1,
      cellSize: 20,
    });
    // The excluded version should have the original position as a candidate
    const hasOriginal = withExclusion.some(
      (c) => c.x === rect.x && c.y === rect.y,
    );
    expect(hasOriginal).toBe(true);
    // Without exclusion, original should not be a candidate
    const hasOriginalWithout = withoutExclusion.some(
      (c) => c.x === rect.x && c.y === rect.y,
    );
    expect(hasOriginalWithout).toBe(false);
  });

  it('findFreeCells returns empty array when no free cells in radius', () => {
    // Fill a 3x3 grid of cells with media items
    const items: ReturnType<typeof mkItem>[] = [];
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        items.push(mkItem(`i${r}_${c}`, c * 20, r * 20, 20, 20, 'media'));
      }
    }
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const candidates = GridService.findFreeCells(rect, items, 'media', undefined, {
      radius: 1,
      cellSize: 20,
    });
    expect(candidates).toEqual([]);
  });

  it('findFreeCells sorts by distance (nearest first)', () => {
    const items: ReturnType<typeof mkItem>[] = [];
    const rect = { x: 0, y: 0, width: 20, height: 20 };
    const candidates = GridService.findFreeCells(rect, items, 'media', undefined, {
      radius: 3,
      cellSize: 20,
    });
    expect(candidates.length).toBeGreaterThan(1);
    // Verify sort order: distances should be non-decreasing
    const origCx = rect.x + rect.width / 2;
    const origCy = rect.y + rect.height / 2;
    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1]!;
      const curr = candidates[i]!;
      const prevDist =
        (prev.x + prev.width / 2 - origCx) ** 2 + (prev.y + prev.height / 2 - origCy) ** 2;
      const currDist =
        (curr.x + curr.width / 2 - origCx) ** 2 + (curr.y + curr.height / 2 - origCy) ** 2;
      expect(prevDist).toBeLessThanOrEqual(currDist);
    }
  });
});
