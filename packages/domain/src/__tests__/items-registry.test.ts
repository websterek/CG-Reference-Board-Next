import { describe, it, expect } from 'vitest';
import {
  ITEM_TYPES,
  layerKindFor,
  defaultLayerIdFor,
  BoardItemSchema,
  asItemId,
} from '../index';

describe('Item registry — layerKind', () => {
  it('every registered type has a layerKind field', () => {
    for (const [type, def] of Object.entries(ITEM_TYPES)) {
      expect(def.layerKind).toBeDefined();
      expect(['frame', 'media', 'overlay', 'annotation']).toContain(def.layerKind);
    }
  });

  it('layerKindFor("rectangle") returns "media"', () => {
    expect(layerKindFor('rectangle')).toBe('media');
  });

  it('layerKindFor("image") returns "media"', () => {
    expect(layerKindFor('image')).toBe('media');
  });
});

describe('defaultLayerIdFor', () => {
  it('returns "frames" for kind "frame"', () => {
    expect(defaultLayerIdFor('frame')).toBe('frames');
  });

  it('returns "media" for kind "media"', () => {
    expect(defaultLayerIdFor('media')).toBe('media');
  });

  it('returns "overlay" for kind "overlay"', () => {
    expect(defaultLayerIdFor('overlay')).toBe('overlay');
  });

  it('returns "annotations" for kind "annotation"', () => {
    expect(defaultLayerIdFor('annotation')).toBe('annotations');
  });
});

describe('BoardItemSchema layerId validation', () => {
  const validItem = {
    id: asItemId('item-1'),
    type: 'rectangle' as const,
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    rotation: 0,
    layerId: 'media',
    attrs: { fillColor: '#4A90D9', strokeColor: '#000000', strokeWidth: 2 },
  };

  it('rejects layerId "default"', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'default' });
    expect(result.success).toBe(false);
  });

  it('accepts layerId "media"', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'media' });
    expect(result.success).toBe(true);
  });

  it('accepts layerId "frames"', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'frames' });
    expect(result.success).toBe(true);
  });

  it('accepts layerId "overlay"', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'overlay' });
    expect(result.success).toBe(true);
  });

  it('accepts layerId "annotations"', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'annotations' });
    expect(result.success).toBe(true);
  });

  it('rejects arbitrary layerId', () => {
    const result = BoardItemSchema.safeParse({ ...validItem, layerId: 'custom-layer' });
    expect(result.success).toBe(false);
  });
});
