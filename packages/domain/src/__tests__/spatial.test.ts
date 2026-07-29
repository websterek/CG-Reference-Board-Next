import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../spatial';
import { asItemId, type BoardItem } from '../board';

function mkItem(id: string, x: number, y: number, w = 50, h = 50): BoardItem {
  return {
    id: asItemId(id),
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    layerId: 'l1' as never,
    attrs: {},
  };
}

describe('SpatialIndex', () => {
  it('insert + search finds overlapping items', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0));
    idx.insert(mkItem('b', 100, 100));
    const hits = idx.search({ x: 10, y: 10, width: 200, height: 200 });
    expect(hits.length).toBe(2);
  });

  it('remove drops items from search', () => {
    const idx = new SpatialIndex();
    const a = mkItem('a', 0, 0);
    idx.insert(a);
    idx.remove(a.id);
    expect(idx.size()).toBe(0);
  });

  it('insert is idempotent on duplicate id', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0));
    idx.insert(mkItem('a', 50, 50));
    expect(idx.size()).toBe(1);
    const hits = idx.search({ x: 60, y: 60, width: 10, height: 10 });
    expect(hits.length).toBe(1);
  });
});
