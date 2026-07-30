/**
 * Image item — schema validation and defaultImageSize helper.
 *
 * Covers D2 (default size rule) and the ImageAttrsSchema contract:
 * naturalWidth/naturalHeight are required positive integers.
 */

import { describe, it, expect } from 'vitest';
import {
  defaultImageSize,
  ImageAttrsSchema,
  type ImageAttrs,
} from '../items/image';

describe('ImageAttrsSchema (Task 1.2)', () => {
  const valid: ImageAttrs = {
    assetId: 'asset-1',
    mimeType: 'image/png',
    status: 'loading',
    naturalWidth: 800,
    naturalHeight: 600,
  };

  it('accepts a complete attrs object with naturalWidth and naturalHeight', () => {
    const result = ImageAttrsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects attrs missing naturalWidth', () => {
    const { naturalWidth: _omitted, ...rest } = valid;
    void _omitted;
    const result = ImageAttrsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects attrs missing naturalHeight', () => {
    const { naturalHeight: _omitted, ...rest } = valid;
    void _omitted;
    const result = ImageAttrsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative naturalWidth', () => {
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalWidth: 0 }).success).toBe(false);
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalWidth: -1 }).success).toBe(false);
  });

  it('rejects zero or negative naturalHeight', () => {
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalHeight: 0 }).success).toBe(false);
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalHeight: -10 }).success).toBe(false);
  });

  it('rejects non-integer naturalWidth / naturalHeight', () => {
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalWidth: 1.5 }).success).toBe(false);
    expect(ImageAttrsSchema.safeParse({ ...valid, naturalHeight: 2.7 }).success).toBe(false);
  });
});

describe('defaultImageSize (Task 1.3, D2)', () => {
  const cellSize = 32;

  it('square aspect (1:1) → 1×1 cell', () => {
    expect(defaultImageSize(800, 800, cellSize)).toEqual({ width: cellSize, height: cellSize });
  });

  it('2:1 landscape → 2×1 cells', () => {
    expect(defaultImageSize(1600, 800, cellSize)).toEqual({ width: 64, height: 32 });
  });

  it('1:2 portrait → 1×2 cells', () => {
    expect(defaultImageSize(800, 1600, cellSize)).toEqual({ width: 32, height: 64 });
  });

  it('16:9 (1.78) rounds up to 2:1', () => {
    // aspect * cellSize = 1.78 * 32 = 56.96, round → 64 (2 cells)
    expect(defaultImageSize(1920, 1080, cellSize)).toEqual({ width: 64, height: 32 });
  });

  it('4:3 (1.33) rounds to 1:1', () => {
    // aspect * cellSize = 1.33 * 32 = 42.67, round → 32 (1 cell)
    expect(defaultImageSize(1200, 900, cellSize)).toEqual({ width: 32, height: 32 });
  });

  it('very wide image (1:10000) is capped at 1×N', () => {
    // aspect = 0.0001, aspect < 1, so use cellSize / aspect = 32 / 0.0001 = 320000,
    // round to nearest cellSize: 320000 / 32 = 10000, * 32 = 320000.
    // height = 320000, width = 32.
    const result = defaultImageSize(1, 10000, cellSize);
    expect(result.width).toBe(cellSize);
    expect(result.height).toBe(320000);
  });

  it('very tall image (10000:1) is capped at N×1', () => {
    const result = defaultImageSize(10000, 1, cellSize);
    expect(result.width).toBe(320000);
    expect(result.height).toBe(cellSize);
  });

  it('floor at 1×1 for any aspect', () => {
    expect(defaultImageSize(2, 2, cellSize)).toEqual({ width: cellSize, height: cellSize });
  });

  it('throws on non-positive natural dims', () => {
    expect(() => defaultImageSize(0, 800, cellSize)).toThrow();
    expect(() => defaultImageSize(800, -1, cellSize)).toThrow();
  });

  it('throws on non-positive cellSize', () => {
    expect(() => defaultImageSize(800, 800, 0)).toThrow();
    expect(() => defaultImageSize(800, 800, -32)).toThrow();
  });

  it('throws on non-finite inputs', () => {
    expect(() => defaultImageSize(NaN, 800, cellSize)).toThrow();
    expect(() => defaultImageSize(800, 800, Infinity)).toThrow();
  });

  it('result is always a tile-aligned rect (multiples of cellSize)', () => {
    const cases: Array<[number, number]> = [
      [800, 800],
      [1600, 800],
      [800, 1600],
      [1920, 1080],
      [1200, 900],
      [1024, 768],
      [640, 480],
    ];
    for (const [w, h] of cases) {
      const r = defaultImageSize(w, h, cellSize);
      expect(r.width % cellSize).toBe(0);
      expect(r.height % cellSize).toBe(0);
      expect(r.width).toBeGreaterThanOrEqual(cellSize);
      expect(r.height).toBeGreaterThanOrEqual(cellSize);
    }
  });

  it('works with cellSize = 20 (domain default)', () => {
    expect(defaultImageSize(800, 800, 20)).toEqual({ width: 20, height: 20 });
    expect(defaultImageSize(1600, 800, 20)).toEqual({ width: 40, height: 20 });
  });
});
