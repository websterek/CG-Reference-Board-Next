import { describe, it, expect } from 'vitest';
import {
  BoardSchema,
  RectangleAttrsSchema,
  ITEM_TYPES,
  isRectangleItem,
  asItemId,
  defaultLayerIdFor,
  layerKindFor,
} from '../index';

describe('ITEM_TYPES registry', () => {
  it('registers rectangle and image', () => {
    expect(ITEM_TYPES.rectangle).toBeDefined();
    expect(ITEM_TYPES.image).toBeDefined();
    expect(ITEM_TYPES.rectangle.type).toBe('rectangle');
    expect(ITEM_TYPES.image.type).toBe('image');
  });

  it('RectangleItemDefinition hits inside bounds', () => {
    const defn = ITEM_TYPES.rectangle;
    const item = {
      id: asItemId('a'),
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      rotation: 0,
      layerId: 'l1' as never,
      attrs: { fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 1 },
    };
    expect(defn.hitTest(item, { x: 10, y: 10 })).toBe(true);
    expect(defn.hitTest(item, { x: 60, y: 60 })).toBe(false);
  });

  it('isRectangleItem narrows with valid attrs', () => {
    const item = {
      id: asItemId('a'),
      type: 'rectangle' as const,
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      rotation: 0,
      layerId: 'l1' as never,
      attrs: { fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 1 },
    };
    expect(isRectangleItem(item)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 11.1 — Correct layerId on item creation
// ---------------------------------------------------------------------------

describe('defaultLayerIdFor(layerKindFor(type)) (Task 11.1)', () => {
  it('resolves frame → frames', () => {
    expect(defaultLayerIdFor(layerKindFor('frame'))).toBe('frames');
  });

  it('resolves rectangle → media', () => {
    // The registry maps rectangle to the 'media' layer kind, whose default
    // layer id is 'media'. Controller createItem paths use this same chain.
    expect(defaultLayerIdFor(layerKindFor('rectangle'))).toBe('media');
  });

  it('resolves image → media', () => {
    expect(defaultLayerIdFor(layerKindFor('image'))).toBe('media');
  });

  it('resolves annotation-stroke → annotations', () => {
    expect(defaultLayerIdFor(layerKindFor('annotation-stroke'))).toBe('annotations');
  });

  it('every LayerKind has a defaultLayerIdFor entry', () => {
    // Regression guard: if a new LayerKind is added but DEFAULT_LAYERS is not
    // updated, defaultLayerIdFor would throw.
    const kinds = ['frame', 'media', 'overlay', 'annotation'] as const;
    for (const k of kinds) {
      expect(() => defaultLayerIdFor(k)).not.toThrow();
    }
  });
});

describe('Zod schemas', () => {
  it('RectangleAttrsSchema validates default attrs', () => {
    expect(
      RectangleAttrsSchema.safeParse({
        fillColor: '#4A90D9',
        strokeColor: '#000000',
        strokeWidth: 2,
      }).success,
    ).toBe(true);
  });

  it('BoardSchema accepts minimal valid board', () => {
    const result = BoardSchema.safeParse({
      id: 'b1',
      name: 'My Board',
      items: {},
      layers: [],
      gridConfig: {
        cellSize: 20,
        subdivisions: 4,
        originX: 0,
        originY: 0,
        snapEnabled: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
