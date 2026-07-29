import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { asLayerId, BoardItemSchema, BoardSchema, LayerSchema } from '../board';
import {
  DEFAULT_KINDS,
  addLayer,
  deleteLayer,
  getAllLayers,
  getLayerDef,
  getLayerIds,
  initLayerVisibility,
  isDefaultKind,
  sortByHitPriority,
  sortByZOrder,
  tryGetLayerDef,
  registerOnChange,
  type LayerDefinition,
} from '../layers/registry';

// Snapshot of default registry state for restoration in afterEach
const DEFAULT_LAYER_IDS = getLayerIds();
const DEFAULT_KINDS_ARRAY = Array.from(DEFAULT_KINDS);

afterEach(() => {
  // Remove any kinds added during the test
  for (const kind of getAllLayers().map((d) => d.kind)) {
    if (!DEFAULT_KINDS.has(kind)) {
      try {
        deleteLayer(kind, 0);
      } catch {
        // best effort
      }
    }
  }
  // Sanity: default kinds still registered
  for (const kind of DEFAULT_KINDS_ARRAY) {
    expect(getLayerDef(kind).kind).toBe(kind);
  }
});

describe('layer-registry: default population', () => {
  it('has exactly 4 default entries', () => {
    const defs = getAllLayers().filter((d) => DEFAULT_KINDS.has(d.kind));
    expect(defs).toHaveLength(4);
  });

  it('frame policy values match the council table', () => {
    const f = getLayerDef('frame');
    expect(f.displayName).toBe('Frames');
    expect(f.layerId).toBe(asLayerId('frames'));
    expect(f.zOrder).toBe(0);
    expect(f.snapPolicy).toBe('mandatory');
    expect(f.overlapRule).toBe('forbid-same-kind');
    expect(f.containmentPolicy).toBe('no-nesting');
    expect(f.canBeConnectorEndpoint).toBe(false);
    expect(f.hitPriority).toBe(10);
    expect(f.defaultVisible).toBe(true);
    expect(f.defaultLocked).toBe(false);
  });

  it('media policy values match the council table', () => {
    const m = getLayerDef('media');
    expect(m.displayName).toBe('Media');
    expect(m.layerId).toBe(asLayerId('media'));
    expect(m.zOrder).toBe(1);
    expect(m.snapPolicy).toBe('mandatory');
    expect(m.overlapRule).toBe('forbid-same-kind');
    expect(m.containmentPolicy).toBe('none');
    expect(m.canBeConnectorEndpoint).toBe(true);
    expect(m.hitPriority).toBe(20);
    expect(m.defaultVisible).toBe(true);
    expect(m.defaultLocked).toBe(false);
  });

  it('overlay policy values match the council table', () => {
    const o = getLayerDef('overlay');
    expect(o.displayName).toBe('Overlay');
    expect(o.layerId).toBe(asLayerId('overlay'));
    expect(o.zOrder).toBe(2);
    expect(o.snapPolicy).toBe('mandatory');
    expect(o.overlapRule).toBe('forbid-same-kind');
    expect(o.containmentPolicy).toBe('none');
    expect(o.canBeConnectorEndpoint).toBe(true);
    expect(o.hitPriority).toBe(30);
    expect(o.defaultVisible).toBe(true);
    expect(o.defaultLocked).toBe(false);
  });

  it('annotation policy values match the council table', () => {
    const a = getLayerDef('annotation');
    expect(a.displayName).toBe('Annotations');
    expect(a.layerId).toBe(asLayerId('annotations'));
    expect(a.zOrder).toBe(4);
    expect(a.snapPolicy).toBe('off');
    expect(a.overlapRule).toBe('none');
    expect(a.containmentPolicy).toBe('none');
    expect(a.canBeConnectorEndpoint).toBe(false);
    expect(a.hitPriority).toBe(50);
    expect(a.defaultVisible).toBe(true);
    expect(a.defaultLocked).toBe(false);
  });

  it('default kinds are marked as default', () => {
    expect(isDefaultKind('frame')).toBe(true);
    expect(isDefaultKind('media')).toBe(true);
    expect(isDefaultKind('overlay')).toBe(true);
    expect(isDefaultKind('annotation')).toBe(true);
  });

  it('non-default kinds return false from isDefaultKind', () => {
    expect(isDefaultKind('connector')).toBe(false);
  });
});

describe('layer-registry: derived lists', () => {
  it('sortByZOrder returns frame, media, overlay, annotation', () => {
    expect(sortByZOrder()).toEqual(['frame', 'media', 'overlay', 'annotation']);
  });

  it('sortByHitPriority returns annotation, overlay, media, frame', () => {
    expect(sortByHitPriority()).toEqual(['annotation', 'overlay', 'media', 'frame']);
  });

  it('getLayerIds returns the four legacy layer IDs', () => {
    expect(getLayerIds().sort()).toEqual(['annotations', 'frames', 'media', 'overlay']);
  });

  it('initLayerVisibility returns all default kinds visible', () => {
    const map = initLayerVisibility();
    expect(map.get('frame')).toBe(true);
    expect(map.get('media')).toBe(true);
    expect(map.get('overlay')).toBe(true);
    expect(map.get('annotation')).toBe(true);
  });
});

describe('layer-registry: getLayerDef / tryGetLayerDef', () => {
  it('getLayerDef returns the definition for a known kind', () => {
    const f = getLayerDef('frame');
    expect(f.kind).toBe('frame');
  });

  it('getLayerDef throws for unknown kinds', () => {
    expect(() => getLayerDef('does-not-exist')).toThrow(/Unknown layer kind/);
  });

  it('tryGetLayerDef returns undefined for unknown kinds', () => {
    expect(tryGetLayerDef('does-not-exist')).toBeUndefined();
  });

  it('tryGetLayerDef returns the definition for a known kind', () => {
    expect(tryGetLayerDef('media')?.kind).toBe('media');
  });
});

describe('layer-registry: addLayer', () => {
  it('adds a new entry and derived sorts include it', () => {
    const def: LayerDefinition = {
      kind: 'connector',
      displayName: 'Connectors',
      layerId: asLayerId('connectors'),
      zOrder: 3,
      snapPolicy: 'mandatory',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 40,
      canBeConnectorEndpoint: false,
      defaultVisible: true,
      defaultLocked: false,
    };
    addLayer(def);
    expect(getLayerDef('connector')).toEqual(def);
    expect(sortByZOrder()).toEqual(['frame', 'media', 'overlay', 'connector', 'annotation']);
    expect(sortByHitPriority()).toEqual([
      'annotation',
      'connector',
      'overlay',
      'media',
      'frame',
    ]);
    expect(getLayerIds()).toContain('connectors');
  });

  it('addLayer throws on duplicate kind', () => {
    expect(() =>
      addLayer({
        kind: 'frame',
        displayName: 'Duplicate',
        layerId: asLayerId('dup'),
        zOrder: 99,
        snapPolicy: 'off',
        overlapRule: 'none',
        containmentPolicy: 'none',
        hitPriority: 99,
        canBeConnectorEndpoint: false,
        defaultVisible: true,
        defaultLocked: false,
      }),
    ).toThrow(/already registered/);
  });

  it('addLayer with defaultVisible=false propagates to initLayerVisibility', () => {
    addLayer({
      kind: 'hidden-kind',
      displayName: 'Hidden',
      layerId: asLayerId('hidden'),
      zOrder: 99,
      snapPolicy: 'off',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 0,
      canBeConnectorEndpoint: false,
      defaultVisible: false,
      defaultLocked: true,
    });
    expect(initLayerVisibility().get('hidden-kind')).toBe(false);
  });
});

describe('layer-registry: deleteLayer', () => {
  it('succeeds when item count is 0 and kind is not default', () => {
    addLayer({
      kind: 'temp',
      displayName: 'Temp',
      layerId: asLayerId('temp'),
      zOrder: 99,
      snapPolicy: 'off',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 0,
      canBeConnectorEndpoint: false,
      defaultVisible: true,
      defaultLocked: false,
    });
    expect(() => deleteLayer('temp', 0)).not.toThrow();
    expect(tryGetLayerDef('temp')).toBeUndefined();
  });

  it('throws when item count > 0', () => {
    addLayer({
      kind: 'populated',
      displayName: 'Populated',
      layerId: asLayerId('populated'),
      zOrder: 99,
      snapPolicy: 'off',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 0,
      canBeConnectorEndpoint: false,
      defaultVisible: true,
      defaultLocked: false,
    });
    expect(() => deleteLayer('populated', 5)).toThrow(/contains 5 item/);
    // entry should still exist
    expect(getLayerDef('populated').kind).toBe('populated');
  });

  it('throws for default kinds', () => {
    expect(() => deleteLayer('frame', 0)).toThrow(/default layer kind/);
    expect(() => deleteLayer('media', 0)).toThrow(/default layer kind/);
    expect(() => deleteLayer('overlay', 0)).toThrow(/default layer kind/);
    expect(() => deleteLayer('annotation', 0)).toThrow(/default layer kind/);
  });

  it('throws for unknown kinds', () => {
    expect(() => deleteLayer('does-not-exist', 0)).toThrow(/Unknown layer kind/);
  });
});

describe('layer-registry: change subscription', () => {
  it('notifies subscribers on addLayer', () => {
    let calls = 0;
    const unsub = registerOnChange(() => {
      calls++;
    });
    addLayer({
      kind: 'sub-test',
      displayName: 'Sub',
      layerId: asLayerId('sub-test'),
      zOrder: 99,
      snapPolicy: 'off',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 0,
      canBeConnectorEndpoint: false,
      defaultVisible: true,
      defaultLocked: false,
    });
    expect(calls).toBe(1);
    unsub();
  });

  it('does not notify after unsubscribe', () => {
    let calls = 0;
    const unsub = registerOnChange(() => {
      calls++;
    });
    unsub();
    addLayer({
      kind: 'sub-test-2',
      displayName: 'Sub2',
      layerId: asLayerId('sub-test-2'),
      zOrder: 99,
      snapPolicy: 'off',
      overlapRule: 'none',
      containmentPolicy: 'none',
      hitPriority: 0,
      canBeConnectorEndpoint: false,
      defaultVisible: true,
      defaultLocked: false,
    });
    expect(calls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: existing 4-kind board data validates unchanged.
// ---------------------------------------------------------------------------

describe('layer-registry: backward compatibility (migration)', () => {
  it('LayerSchema accepts legacy kind values (frame/media/overlay/annotation)', () => {
    for (const kind of ['frame', 'media', 'overlay', 'annotation']) {
      const result = LayerSchema.safeParse({
        id: 'L',
        name: 'L',
        order: 0,
        visible: true,
        locked: false,
        kind,
      });
      expect(result.success).toBe(true);
    }
  });

  it('LayerSchema rejects unknown kinds (8.1 — string + registry refine)', () => {
    const result = LayerSchema.safeParse({
      id: 'L',
      name: 'L',
      order: 0,
      visible: true,
      locked: false,
      kind: 'mystery-kind',
    });
    expect(result.success).toBe(false);
  });

  it('BoardItemSchema accepts legacy layerId values (frames/media/overlay/annotations)', () => {
    for (const layerId of ['frames', 'media', 'overlay', 'annotations']) {
      const result = BoardItemSchema.safeParse({
        id: 'i1',
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 80,
        height: 60,
        rotation: 0,
        layerId,
        attrs: { fillColor: '#000000', strokeColor: '#000000', strokeWidth: 1 },
      });
      expect(result.success).toBe(true);
    }
  });

  it('BoardItemSchema rejects unknown layerId (8.2 — registry-derived allowed list)', () => {
    const result = BoardItemSchema.safeParse({
      id: 'i1',
      type: 'rectangle',
      x: 0,
      y: 0,
      width: 80,
      height: 60,
      rotation: 0,
      layerId: 'not-a-layer',
      attrs: { fillColor: '#000000', strokeColor: '#000000', strokeWidth: 1 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a full legacy 4-kind board snapshot (8.4 — migration round-trip)', () => {
    const snapshot = {
      id: 'b1',
      name: 'Legacy board',
      items: {
        a: {
          id: 'a',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          layerId: 'media',
          attrs: { fillColor: '#4A90D9', strokeColor: '#000000', strokeWidth: 2 },
        },
        b: {
          id: 'b',
          type: 'frame',
          x: 50,
          y: 50,
          width: 200,
          height: 200,
          rotation: 0,
          layerId: 'frames',
          attrs: {},
        },
      },
      layers: [
        { id: 'frames', name: 'Frames', order: 0, visible: true, locked: false, kind: 'frame' },
        { id: 'media', name: 'Media', order: 1, visible: true, locked: false, kind: 'media' },
        { id: 'overlay', name: 'Overlay', order: 2, visible: true, locked: false, kind: 'overlay' },
        { id: 'annotations', name: 'Annotations', order: 4, visible: true, locked: false, kind: 'annotation' },
      ],
      gridConfig: {
        cellSize: 20,
        subdivisions: 4,
        originX: 0,
        originY: 0,
        snapEnabled: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = BoardSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
  });

  it('registry has no DEFAULT_LAYERS export (8.3 — source of truth moved to registry)', async () => {
    // Dynamic import to ensure we are looking at the public surface.
    const mod = await import('../index');
    expect((mod as Record<string, unknown>).DEFAULT_LAYERS).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Behavior: auto-routing, overlap rules, snap exemption, containment
// (Section 10 — behavior tests using the registry as source of truth).
// ---------------------------------------------------------------------------

describe('layer-registry: behavior (10.1-10.7)', () => {
  it('10.1 — auto-routing: rectangle → media via layerKindFor (existing)', async () => {
    const { layerKindFor, defaultLayerIdFor } = await import('../index');
    expect(layerKindFor('rectangle')).toBe('media');
    expect(defaultLayerIdFor('media')).toBe('media');
  });

  it('10.1 — auto-routing: frame → frame, annotation-stroke → annotation', async () => {
    const { layerKindFor } = await import('../index');
    expect(layerKindFor('frame')).toBe('frame');
    expect(layerKindFor('annotation-stroke')).toBe('annotation');
    expect(layerKindFor('image')).toBe('media');
  });

  it('10.2 — cross-layer overlap allowed: media and frame have no overlap constraint', () => {
    // Cross-kind overlap is always allowed by the registry's policy
    // (canPlace compares same-kind items only). Verify the registry
    // entries do not claim otherwise.
    expect(getLayerDef('media').overlapRule).toBe('forbid-same-kind');
    expect(getLayerDef('frame').overlapRule).toBe('forbid-same-kind');
  });

  it('10.3 — same-kind non-overlap: forbid-same-kind is the policy for media, frame, overlay', () => {
    expect(getLayerDef('media').overlapRule).toBe('forbid-same-kind');
    expect(getLayerDef('frame').overlapRule).toBe('forbid-same-kind');
    expect(getLayerDef('overlay').overlapRule).toBe('forbid-same-kind');
  });

  it('10.4 — annotation snap exemption: annotation has snapPolicy="off"', () => {
    expect(getLayerDef('annotation').snapPolicy).toBe('off');
    // Other kinds must snap
    expect(getLayerDef('frame').snapPolicy).toBe('mandatory');
    expect(getLayerDef('media').snapPolicy).toBe('mandatory');
    expect(getLayerDef('overlay').snapPolicy).toBe('mandatory');
  });

  it('10.5 — frame no-nesting containment: frame has containmentPolicy="no-nesting"', () => {
    expect(getLayerDef('frame').containmentPolicy).toBe('no-nesting');
    expect(getLayerDef('media').containmentPolicy).toBe('none');
    expect(getLayerDef('overlay').containmentPolicy).toBe('none');
    expect(getLayerDef('annotation').containmentPolicy).toBe('none');
  });

  it('10.6 — z-order rendering: sortByZOrder() returns frame, media, overlay, annotation', () => {
    expect(sortByZOrder()).toEqual(['frame', 'media', 'overlay', 'annotation']);
  });

  it('10.7 — hit-test priority: sortByHitPriority() returns annotation first', () => {
    const order = sortByHitPriority();
    expect(order[0]).toBe('annotation');
    expect(order).toEqual(['annotation', 'overlay', 'media', 'frame']);
  });

  it('10.x — annotation is exempt from non-overlap rule (overlapRule="none")', () => {
    // Even though the canPlace check filters by same-kind, the registry
    // explicitly sets annotation to "none" so future cross-kind rules
    // (e.g. annotation overlapping media) are also allowed.
    expect(getLayerDef('annotation').overlapRule).toBe('none');
  });
});
