/**
 * Renderer unit tests — confirm that PixiJS renderers return Container
 * without `as unknown as Container` double-casts (Bug #14).
 *
 * These tests instantiate renderers and verify the returned value is a
 * Container (and a Graphics) instance, not just a cast trick.
 */

import { describe, it, expect } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { BoardItem } from '@gridboard/domain';
import { renderFrame } from '../canvas/renderers/frame';
import { renderAnnotation } from '../canvas/renderers/annotation';
import { renderRectangle } from '../canvas/renderers/rectangle';

function mkItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item' as never,
    type: 'frame',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    rotation: 0,
    layerId: 'frames' as never,
    attrs: {},
    ...overrides,
  };
}

describe('renderFrame (Task 11.8)', () => {
  it('returns a Container-compatible object without double-cast', () => {
    const item = mkItem({ type: 'frame' });
    const result = renderFrame(item);
    expect(result).toBeInstanceOf(Container);
    // Graphics extends Container in PixiJS v8 — confirm the returned value
    // is also a Graphics instance (no cast trick required).
    expect(result).toBeInstanceOf(Graphics);
  });
});

describe('renderAnnotation (Task 11.8)', () => {
  it('returns a Container-compatible object for an empty stroke', () => {
    const item = mkItem({ type: 'annotation-stroke', attrs: {} });
    const result = renderAnnotation(item);
    expect(result).toBeInstanceOf(Container);
    expect(result).toBeInstanceOf(Graphics);
  });

  it('returns a Container-compatible object for a stroke with vertices', () => {
    const item = mkItem({
      type: 'annotation-stroke',
      attrs: { vertices: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 5 }] },
    });
    const result = renderAnnotation(item);
    expect(result).toBeInstanceOf(Container);
    expect(result).toBeInstanceOf(Graphics);
  });
});

describe('renderRectangle (follow-up to Task 11.8)', () => {
  it('returns a Container-compatible object without double-cast', () => {
    const item = mkItem({
      type: 'rectangle',
      attrs: { fillColor: '#ff0000', strokeColor: '#000000', strokeWidth: 1 },
    });
    const result = renderRectangle(item);
    expect(result).toBeInstanceOf(Container);
    expect(result).toBeInstanceOf(Graphics);
  });
});