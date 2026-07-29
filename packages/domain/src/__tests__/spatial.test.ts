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
    layerId: 'media' as never,
    attrs: {},
  };
}

describe('SpatialIndex', () => {
  it('insert + search finds overlapping items', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0), 'media');
    idx.insert(mkItem('b', 100, 100), 'media');
    const hits = idx.search({ x: 10, y: 10, width: 200, height: 200 });
    expect(hits.length).toBe(2);
  });

  it('remove drops items from search', () => {
    const idx = new SpatialIndex();
    const a = mkItem('a', 0, 0);
    idx.insert(a, 'media');
    idx.remove(a.id);
    expect(idx.size()).toBe(0);
  });

  it('insert is idempotent on duplicate id', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0), 'media');
    idx.insert(mkItem('a', 50, 50), 'media');
    expect(idx.size()).toBe(1);
    const hits = idx.search({ x: 60, y: 60, width: 10, height: 10 });
    expect(hits.length).toBe(1);
  });

  it('findOverlapping filters by layer kind', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0, 50, 50), 'media');
    idx.insert(mkItem('b', 10, 10, 50, 50), 'frame');
    idx.insert(mkItem('c', 20, 20, 50, 50), 'media');

    // Query for media — should find 'a' and 'c' but not 'b'
    const mediaHits = idx.findOverlapping(
      { x: 0, y: 0, width: 100, height: 100 },
      'media',
    );
    expect(mediaHits.map((h) => h.id).sort()).toEqual(['a', 'c']);

    // Query for frame — should find only 'b'
    const frameHits = idx.findOverlapping(
      { x: 0, y: 0, width: 100, height: 100 },
      'frame',
    );
    expect(frameHits.map((h) => h.id)).toEqual(['b']);
  });

  it('findOverlapping excludes specified id', () => {
    const idx = new SpatialIndex();
    idx.insert(mkItem('a', 0, 0, 50, 50), 'media');
    idx.insert(mkItem('b', 10, 10, 50, 50), 'media');

    const hits = idx.findOverlapping(
      { x: 0, y: 0, width: 100, height: 100 },
      'media',
      asItemId('a'),
    );
    expect(hits.map((h) => h.id)).toEqual(['b']);
  });
});
