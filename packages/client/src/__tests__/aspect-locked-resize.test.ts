/**
 * Aspect-locked resize tests — verify the D4 contract.
 *
 * For image items, the dominant drag axis drives the long dimension; the
 * short dimension follows from the natural aspect. The opposite corner
 * is anchored. Both dimensions are integer multiples of cellSize. The
 * resulting rect's width/height ratio matches the natural aspect exactly
 * (or as close as the tile-snap allows).
 *
 * Pure helper, no PixiJS.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { aspectLockedResize } from '../canvas/controller';

const cellSize = 32;

describe('aspectLockedResize (D4)', () => {
  it('2:1 image, br corner drag down-right, dominant axis X: grows to a tile-aligned 2:1 rect', () => {
    const start = { x: 0, y: 0, width: 64, height: 32 };
    // Drag pointer at x=200, y=20 (mostly horizontal, dominant axis X).
    // The math self-stabilizes at integer multiples of cellSize: 256×128 (8×4).
    // That is a valid 2:1 rect (256/128 = 2.0).
    const r1 = aspectLockedResize(start, 1600, 800, 'br', { x: 200, y: 20 }, cellSize);
    expect(r1.width % cellSize).toBe(0);
    expect(r1.height % cellSize).toBe(0);
    expect(r1.width / r1.height).toBeCloseTo(2, 1);
    expect(r1.width).toBeGreaterThan(start.width);
    expect(r1.height).toBeGreaterThan(start.height);

    // 2. Slight drag right: rawDx=80, rawDy=5 — should still grow to 2:1
    const r2 = aspectLockedResize(start, 1600, 800, 'br', { x: 80, y: 5 }, cellSize);
    expect(r2.width).toBeGreaterThanOrEqual(start.width);
    expect(r2.width % cellSize).toBe(0);
    expect(r2.height % cellSize).toBe(0);
    expect(r2.width / r2.height).toBeCloseTo(2, 1);
  });

  it('2:1 image, br corner drag primarily down: dominant Y, result still preserves aspect', () => {
    const start = { x: 0, y: 0, width: 64, height: 32 };
    // rawDx = 30, rawDy = 200 → dominant is Y.
    // height = ceil(200/32)*32 = 224
    // aspect = 2 (landscape), long side is width. width = ceil(224*2/32)*32 = 448 (14 cells)
    const r = aspectLockedResize(start, 1600, 800, 'br', { x: 30, y: 200 }, cellSize);
    expect(r.height).toBe(224);
    expect(r.width).toBe(448);
    expect(r.width / r.height).toBeCloseTo(2, 1);
  });

  it('1:2 portrait image, br corner drag down-right: dominant X, height follows', () => {
    const start = { x: 0, y: 0, width: 32, height: 64 };
    // aspect = 0.5 (portrait). rawDx=200, rawDy=20 → dominant is X.
    // width = ceil(200/32)*32 = 224
    // aspect < 1: long side is width. height = ceil(224/0.5/32)*32 = 448.
    const r = aspectLockedResize(start, 800, 1600, 'br', { x: 200, y: 20 }, cellSize);
    expect(r.width).toBe(224);
    expect(r.height).toBe(448);
    expect(r.width / r.height).toBeCloseTo(0.5, 1);
  });

  it('tl corner drag: opposite corner (br) is anchored', () => {
    // Fixed corner for tl = start's bottom-right.
    // start = (0, 0, 64, 32). bottom-right = (64, 32).
    // Drag pointer up-left to (10, 10): rawDx = |10-64| = 54, rawDy = |10-32| = 22.
    // dominant is X. width = ceil(54/32)*32 = 64. aspect = 2, height = ceil(64/2/32)*32 = 32.
    // Then re-derive: width = ceil(32*2/32)*32 = 64. Stable.
    // Position: fixed (br) corner is anchored, so new rect's br = (64, 32).
    // new x = 64 - 64 = 0, new y = 32 - 32 = 0.
    const start = { x: 0, y: 0, width: 64, height: 32 };
    const r = aspectLockedResize(start, 1600, 800, 'tl', { x: 10, y: 10 }, cellSize);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(64);
    expect(r.height).toBe(32);
  });

  it('bl corner drag: opposite corner (tr) is anchored', () => {
    // For bl: fixed corner = (start.x + start.width, start.y) = (64, 0).
    // Drag pointer at (10, 50): rawDx = |10-64| = 54, rawDy = |50-0| = 50.
    // dominant is X. width = ceil(54/32)*32 = 64. aspect=2, height=32.
    // Position: x = fixedX - width = 64 - 64 = 0, y = 0.
    const start = { x: 0, y: 0, width: 64, height: 32 };
    const r = aspectLockedResize(start, 1600, 800, 'bl', { x: 10, y: 50 }, cellSize);
    expect(r.x + r.width).toBe(64);
    expect(r.y).toBe(0);
    expect(r.width % cellSize).toBe(0);
    expect(r.height % cellSize).toBe(0);
  });

  it('tr corner drag: opposite corner (bl) is anchored', () => {
    // For tr: fixed corner = (start.x, start.y + start.height) = (0, 32).
    // Drag pointer at (50, 10): rawDx = 50, rawDy = |10-32| = 22.
    // dominant is X. width = ceil(50/32)*32 = 64. aspect=2, height=32.
    // Position: x = 0, y = fixedY - height = 32 - 32 = 0.
    const start = { x: 0, y: 0, width: 64, height: 32 };
    const r = aspectLockedResize(start, 1600, 800, 'tr', { x: 50, y: 10 }, cellSize);
    expect(r.x).toBe(0);
    expect(r.y + r.height).toBe(32);
    expect(r.width).toBe(64);
    expect(r.height).toBe(32);
  });

  it('result is always a tile-aligned rect (multiples of cellSize)', () => {
    const start = { x: 100, y: 100, width: 64, height: 32 };
    const cases: Array<['tl' | 'tr' | 'bl' | 'br', { x: number; y: number }]> = [
      ['br', { x: 300, y: 200 }],
      ['bl', { x: 0, y: 200 }],
      ['tr', { x: 300, y: 0 }],
      ['tl', { x: 0, y: 0 }],
    ];
    for (const [corner, ptr] of cases) {
      const r = aspectLockedResize(start, 1600, 800, corner, ptr, cellSize);
      expect(r.width % cellSize).toBe(0);
      expect(r.height % cellSize).toBe(0);
      expect(r.width).toBeGreaterThanOrEqual(cellSize);
      expect(r.height).toBeGreaterThanOrEqual(cellSize);
    }
  });

  it('result preserves natural aspect (within tile-snap tolerance)', () => {
    const start = { x: 0, y: 0, width: 64, height: 32 };
    const cases: Array<[number, number, { x: number; y: number }]> = [
      [1600, 800, { x: 250, y: 100 }],
      [800, 1600, { x: 100, y: 250 }],
      [1200, 900, { x: 200, y: 200 }],
    ];
    for (const [natW, natH, ptr] of cases) {
      const r = aspectLockedResize(start, natW, natH, 'br', ptr, cellSize);
      const expectedAspect = natW / natH;
      const actualAspect = r.width / r.height;
      expect(actualAspect).toBeCloseTo(expectedAspect, 0);
    }
  });

  it('handles zero / negative natural dims by returning startBounds unchanged', () => {
    const start = { x: 10, y: 20, width: 64, height: 32 };
    const r = aspectLockedResize(start, 0, 0, 'br', { x: 200, y: 100 }, cellSize);
    expect(r).toEqual(start);
  });
});
