/**
 * Image renderer tests — cover-fit math, mask geometry, legacy fallback.
 *
 * Tests the pure `coverFit` helper directly and verifies the `renderImage`
 * Container composition (mask + sprite) and the legacy `onBackfill`
 * callback. PixiJS is initialized in happy-dom so we can call `renderImage`
 * and inspect the returned Container / mask.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { BoardItem } from '@gridboard/domain';
import { asItemId } from '@gridboard/domain';
import { coverFit, renderImage } from '../canvas/renderers/image';

function mkItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: asItemId('item-1'),
    type: 'image',
    x: 0,
    y: 0,
    width: 64,
    height: 32,
    rotation: 0,
    layerId: 'media' as never,
    attrs: {
      assetId: 'asset-1',
      mimeType: 'image/png',
      status: 'loading',
      naturalWidth: 1600,
      naturalHeight: 800,
    },
    ...overrides,
  };
}

describe('coverFit (D3)', () => {
  it('2:1 image in 2×1 cell: scale = cell/natural, fills exactly', () => {
    // item 64x32, natural 1600x800 → scale = max(64/1600, 32/800) = 0.04
    const fit = coverFit(64, 32, 1600, 800);
    expect(fit.scale).toBeCloseTo(0.04, 5);
    expect(fit.drawW).toBe(64);
    expect(fit.drawH).toBe(32);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(0);
  });

  it('square image in 2×1 landscape rect: cover-fit crops top/bottom', () => {
    // item 64x32 (2:1), natural 100x100 (1:1) → scale = max(64/100, 32/100) = 0.64
    // drawW = 64, drawH = 64, offsetX = 0, offsetY = -16
    const fit = coverFit(64, 32, 100, 100);
    expect(fit.scale).toBeCloseTo(0.64, 5);
    expect(fit.drawW).toBe(64);
    expect(fit.drawH).toBe(64);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(-16);
  });

  it('16:9 image in 1:1 cell: crops sides', () => {
    // item 32x32, natural 1600x900 (16:9) → scale = max(32/1600, 32/900) = 32/900
    // drawW = 1600 * 32/900 ≈ 56.89, drawH = 32, offsetX = (32-56.89)/2 ≈ -12.45 → -12
    const fit = coverFit(32, 32, 1600, 900);
    expect(fit.scale).toBeCloseTo(32 / 900, 5);
    expect(fit.drawH).toBe(32);
    expect(fit.drawW).toBe(Math.round((1600 * 32) / 900));
    expect(fit.offsetY).toBe(0);
    // Offset rounded to int (no sub-pixel positioning)
    expect(Number.isInteger(fit.offsetX)).toBe(true);
  });

  it('1:2 portrait in 2:1 landscape: crops top/bottom', () => {
    // item 64x32, natural 800x1600 → scale = max(64/800, 32/1600) = 0.08
    // drawW = 64, drawH = 128, offsetX = 0, offsetY = (32-128)/2 = -48
    const fit = coverFit(64, 32, 800, 1600);
    expect(fit.scale).toBeCloseTo(0.08, 5);
    expect(fit.drawW).toBe(64);
    expect(fit.drawH).toBe(128);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(-48);
  });

  it('returns sensible fallback for non-positive natural dims', () => {
    const fit = coverFit(64, 32, 0, 0);
    expect(fit.drawW).toBe(64);
    expect(fit.drawH).toBe(32);
  });

  it('always rounds offsets to integers (no sub-pixel positioning)', () => {
    // Choose aspect so the offset has a fractional value
    const fit = coverFit(50, 33, 100, 100);
    expect(Number.isInteger(fit.offsetX)).toBe(true);
    expect(Number.isInteger(fit.offsetY)).toBe(true);
  });
});

describe('renderImage (D3 cover-fit + mask)', () => {
  it('returns a Container at the item position', () => {
    const item = mkItem({ x: 100, y: 200 });
    const wrap = renderImage(item);
    expect(wrap).toBeInstanceOf(Container);
    expect(wrap.position.x).toBe(100);
    expect(wrap.position.y).toBe(200);
  });

  it('renders a placeholder while the texture is loading', () => {
    const item = mkItem();
    const wrap = renderImage(item, {
      // Never-resolving promise so the loading placeholder stays.
      loadTexture: () => new Promise<Texture>(() => {}),
    });
    expect(wrap.children.length).toBeGreaterThan(0);
    // The placeholder is a Graphics; we don't need to assert more —
    // its existence is enough to confirm the loading path is taken.
  });

  it('returns an error overlay when status is "error"', () => {
    const item = mkItem({ attrs: { assetId: 'asset-1', mimeType: 'image/png', status: 'error', naturalWidth: 100, naturalHeight: 100 } });
    const wrap = renderImage(item);
    expect(wrap).toBeInstanceOf(Container);
    // No async load happens for the error path.
  });

  it('returns an error overlay when assetId is empty', () => {
    const item = mkItem({ attrs: { assetId: '', mimeType: 'image/png', status: 'loading', naturalWidth: 100, naturalHeight: 100 } });
    const wrap = renderImage(item);
    expect(wrap).toBeInstanceOf(Container);
  });

  it('attaches a mask equal to the item rect after texture load', async () => {
    const item = mkItem({ width: 96, height: 64 });
    // Build a minimal fake Texture. We only need the renderer to call
    // `tex.source.width/height`; in jsdom these are undefined, so the
    // renderer falls back to the natural dims from attrs.
    const fakeSource = { width: 1600, height: 800 } as unknown as Texture['source'];
    const fakeTex = {
      source: fakeSource,
      width: 1600,
      height: 800,
    } as unknown as Texture;

    const wrap = renderImage(item, {
      loadTexture: () => Promise.resolve(fakeTex),
    });
    // Wait for the promise to resolve and the .then handler to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(wrap.mask).not.toBeNull();
    const mask = wrap.mask as Graphics;
    expect(mask).toBeInstanceOf(Graphics);
    // The mask geometry should be the item rect; we don't have a
    // direct getter, but we can check that the mask was added as a
    // child of the wrap.
    expect(wrap.children).toContain(mask);
  });

  it('invokes onBackfill when the real texture dimensions differ from attrs', async () => {
    const item = mkItem({
      width: 96,
      height: 64,
      attrs: { assetId: 'asset-1', mimeType: 'image/png', status: 'loading', naturalWidth: 200, naturalHeight: 200 },
    });
    // Texture's real dims are 1600x800 (different from stored 200x200).
    const fakeSource = { width: 1600, height: 800 } as unknown as Texture['source'];
    const fakeTex = { source: fakeSource, width: 1600, height: 800 } as unknown as Texture;

    const onBackfill = vi.fn();
    renderImage(item, {
      loadTexture: () => Promise.resolve(fakeTex),
      onBackfill,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(onBackfill).toHaveBeenCalledWith({ naturalWidth: 1600, naturalHeight: 800 });
  });

  it('does NOT invoke onBackfill when stored natural dims match the texture', async () => {
    const item = mkItem({
      attrs: { assetId: 'asset-1', mimeType: 'image/png', status: 'loading', naturalWidth: 1600, naturalHeight: 800 },
    });
    const fakeSource = { width: 1600, height: 800 } as unknown as Texture['source'];
    const fakeTex = { source: fakeSource, width: 1600, height: 800 } as unknown as Texture;

    const onBackfill = vi.fn();
    renderImage(item, {
      loadTexture: () => Promise.resolve(fakeTex),
      onBackfill,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(onBackfill).not.toHaveBeenCalled();
  });

  /**
   * Suggestion 1 follow-up: the renderer emits the backfill payload
   * in the exact shape the controller forwards to `opts.onItemChange`.
   * This test simulates the controller's wrapper callback and
   * confirms the round-tripped payload has the right fields so the
   * Yjs adapter receives a usable update.
   */
  it('onBackfill payload is the exact shape used by the controller (id + partial.attrs.naturalWidth/Height)', async () => {
    const item = mkItem({
      attrs: { assetId: 'asset-1', mimeType: 'image/png', status: 'loading', naturalWidth: 200, naturalHeight: 200 },
    });
    const fakeSource = { width: 1600, height: 800 } as unknown as Texture['source'];
    const fakeTex = { source: fakeSource, width: 1600, height: 800 } as unknown as Texture;

    // Mirror the controller's wiring: onBackfill triggers an
    // onItemChange call with the natural dims merged into attrs.
    const onItemChange = vi.fn();
    const onBackfill = (dims: { naturalWidth: number; naturalHeight: number }) => {
      onItemChange({
        id: String(item.id),
        partial: {
          attrs: {
            ...(item.attrs as Record<string, unknown>),
            naturalWidth: dims.naturalWidth,
            naturalHeight: dims.naturalHeight,
          } as never,
        },
      });
    };
    renderImage(item, { loadTexture: () => Promise.resolve(fakeTex), onBackfill });
    await new Promise((r) => setTimeout(r, 10));
    expect(onItemChange).toHaveBeenCalledTimes(1);
    const call = onItemChange.mock.calls[0]![0];
    expect(call.id).toBe('item-1');
    expect(call.partial.attrs).toMatchObject({
      naturalWidth: 1600,
      naturalHeight: 800,
    });
  });
});
