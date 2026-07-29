import { describe, it, expect } from 'vitest';
import { GridService } from '../grid';
import { DEFAULT_GRID_CONFIG } from '../board';

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
});
