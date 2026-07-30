/**
 * ConnectorItem unit tests — see tasks 13.1-13.15 in
 * openspec/changes/connector-items/tasks.md.
 */

import { describe, it, expect } from 'vitest';
import {
  asItemId,
  asLayerId,
  type BoardItem,
} from '../board';
import {
  DEFAULT_CONNECTOR_ATTRS,
  ConnectorAttrsSchema,
  ConnectorItemDefinition,
  isConnectorItem,
  getConnectorBounds,
  connectorHitTest,
} from '../index';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  type: 'rectangle' | 'connector',
  x: number,
  y: number,
  width: number,
  height: number,
  attrs: Record<string, unknown> = {},
): BoardItem {
  return {
    id: asItemId(id),
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    layerId: asLayerId(type === 'connector' ? 'connectors' : 'media'),
    attrs,
  };
}

function makeConnector(
  id: string,
  fromId: string,
  toId: string,
  overrides: Partial<{
    fromAnchor: 'auto' | { x: number; y: number };
    toAnchor: 'auto' | { x: number; y: number };
    waypoints: Array<{ x: number; y: number }>;
    routing: 'straight' | 'orthogonal' | 'curved';
    style: {
      strokeColor: string;
      strokeWidth: number;
      arrowheadStart: 'none' | 'arrow';
      arrowheadEnd: 'none' | 'arrow';
    };
    dangling: boolean;
  }> = {},
): BoardItem {
  return makeItem(id, 'connector', 0, 0, 0, 0, {
    from: asItemId(fromId),
    to: asItemId(toId),
    fromAnchor: overrides.fromAnchor ?? 'auto',
    toAnchor: overrides.toAnchor ?? 'auto',
    waypoints: overrides.waypoints ?? [],
    routing: overrides.routing ?? 'straight',
    style: overrides.style ?? {
      strokeColor: '#ffffff',
      strokeWidth: 2,
      arrowheadStart: 'none',
      arrowheadEnd: 'arrow',
    },
    dangling: overrides.dangling ?? false,
  });
}

// ---------------------------------------------------------------------------
// 13.1-13.4: Schema validation
// ---------------------------------------------------------------------------

describe('ConnectorAttrsSchema', () => {
  it('13.1 — validates a correct connector attrs object', () => {
    const valid = {
      from: 'item-1',
      to: 'item-2',
      fromAnchor: 'auto' as const,
      toAnchor: 'auto' as const,
      waypoints: [],
      routing: 'straight' as const,
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'none' as const,
        arrowheadEnd: 'arrow' as const,
      },
      dangling: false,
    };
    const result = ConnectorAttrsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('13.2 — rejects missing from', () => {
    const result = ConnectorAttrsSchema.safeParse({
      to: 'item-2',
      fromAnchor: 'auto',
      toAnchor: 'auto',
      waypoints: [],
      routing: 'straight',
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
      },
      dangling: false,
    });
    expect(result.success).toBe(false);
  });

  it('13.2 — rejects missing to', () => {
    const result = ConnectorAttrsSchema.safeParse({
      from: 'item-1',
      fromAnchor: 'auto',
      toAnchor: 'auto',
      waypoints: [],
      routing: 'straight',
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
      },
      dangling: false,
    });
    expect(result.success).toBe(false);
  });

  it('13.3 — rejects invalid routing', () => {
    const result = ConnectorAttrsSchema.safeParse({
      from: 'item-1',
      to: 'item-2',
      fromAnchor: 'auto',
      toAnchor: 'auto',
      waypoints: [],
      routing: 'wavy',
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'none',
        arrowheadEnd: 'arrow',
      },
      dangling: false,
    });
    expect(result.success).toBe(false);
  });

  it('13.4 — rejects invalid arrowhead values', () => {
    const result = ConnectorAttrsSchema.safeParse({
      from: 'item-1',
      to: 'item-2',
      fromAnchor: 'auto',
      toAnchor: 'auto',
      waypoints: [],
      routing: 'straight',
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 2,
        arrowheadStart: 'double-arrow',
        arrowheadEnd: 'arrow',
      },
      dangling: false,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13.5-13.7: getConnectorBounds
// ---------------------------------------------------------------------------

describe('getConnectorBounds', () => {
  it('13.5 — straight connector between two items: bounds are union of anchors plus padding', () => {
    // Endpoint items: a at (100,200) 80x60, b at (400,300) 80x60.
    // Auto anchors → centers (140, 230) and (440, 330).
    // Bounds should be (140-12, 230-12) to (440+12, 330+12).
    const a = makeItem('a', 'rectangle', 100, 200, 80, 60);
    const b = makeItem('b', 'rectangle', 400, 300, 80, 60);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    const bounds = getConnectorBounds(connector, items);
    expect(bounds.x).toBe(140 - 12);
    expect(bounds.y).toBe(230 - 12);
    expect(bounds.width).toBe(440 - 140 + 24);
    expect(bounds.height).toBe(330 - 230 + 24);
  });

  it('13.6 — bounds include waypoints', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 80, 60);
    const b = makeItem('b', 'rectangle', 200, 0, 80, 60);
    const connector = makeConnector('c', 'a', 'b', {
      waypoints: [{ x: 100, y: 200 }],
    });
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    const bounds = getConnectorBounds(connector, items);
    // minX = 40 (a center), minY = 0 (a center), but waypoint y=200 extends down
    // Actually anchors auto-resolve to centers, so:
    //   a center: (40, 30)
    //   waypoint: (100, 200)
    //   b center: (240, 30)
    // minX = 40, minY = 30, maxX = 240, maxY = 200
    // After padding 12: x=28, y=18, width=224, height=182
    expect(bounds.x).toBe(28);
    expect(bounds.y).toBe(18);
    expect(bounds.width).toBe(224);
    expect(bounds.height).toBe(194);
  });

  it('13.7 — bounds include padding for stroke width and arrowheads', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 100, 100, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    const bounds = getConnectorBounds(connector, items);
    // Both items are 0x0 so their centers are (0,0) and (100,100).
    // Padding is 12, so the bounds box extends 12px on every side.
    expect(bounds.x).toBe(-12);
    expect(bounds.y).toBe(-12);
    expect(bounds.width).toBe(124);
    expect(bounds.height).toBe(124);
  });
});

// ---------------------------------------------------------------------------
// 13.8-13.11: connectorHitTest
// ---------------------------------------------------------------------------

describe('connectorHitTest', () => {
  it('13.8 — returns true for a point within 8px of the path', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // Path is from (0,0) to (200,0). 4px below the midpoint is a hit.
    expect(connectorHitTest(connector, { x: 100, y: 4 }, (id) => items.get(id))).toBe(true);
  });

  it('13.9 — returns false for a point more than 8px from the path', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // 20px below the midpoint is too far.
    expect(connectorHitTest(connector, { x: 100, y: 20 }, (id) => items.get(id))).toBe(false);
  });

  it('13.10 — returns true for a point on an endpoint pin', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // 3px from the source anchor (0,0) is within the pin radius.
    expect(connectorHitTest(connector, { x: 3, y: 3 }, (id) => items.get(id))).toBe(true);
  });

  it('13.11 — returns true for a point within 8px of a waypoint segment', () => {
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 200, 0, 0);
    const connector = makeConnector('c', 'a', 'b', {
      waypoints: [{ x: 100, y: 0 }],
    });
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // The waypoint segment is (0,0) → (100,0). 5px below the midpoint is a hit.
    expect(connectorHitTest(connector, { x: 50, y: 5 }, (id) => items.get(id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// connectorPinHit (used by reattach flow, task 11.2)
// ---------------------------------------------------------------------------

describe('connectorPinHit', () => {
  it('returns "from" when point is near the source anchor', async () => {
    const { connectorPinHit } = await import('../items/connector');
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // 4px from the source anchor (0,0) is within the pin radius.
    expect(connectorPinHit(connector, { x: 4, y: 4 }, (id) => items.get(id))).toBe('from');
  });

  it('returns "to" when point is near the target anchor', async () => {
    const { connectorPinHit } = await import('../items/connector');
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // 4px from the target anchor (200, 0).
    expect(connectorPinHit(connector, { x: 196, y: 4 }, (id) => items.get(id))).toBe('to');
  });

  it('returns null when point is not near either anchor', async () => {
    const { connectorPinHit } = await import('../items/connector');
    const a = makeItem('a', 'rectangle', 0, 0, 0, 0);
    const b = makeItem('b', 'rectangle', 200, 0, 0, 0);
    const connector = makeConnector('c', 'a', 'b');
    const items = new Map<string, BoardItem>([
      ['a', a],
      ['b', b],
      ['c', connector],
    ]);
    // Midpoint at (100, 0), 50px below is far from any anchor.
    expect(connectorPinHit(connector, { x: 100, y: 50 }, (id) => items.get(id))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 13.12-13.13: isConnectorItem
// ---------------------------------------------------------------------------

describe('isConnectorItem', () => {
  it('13.12 — returns true for a valid connector item', () => {
    const connector = makeConnector('c', 'a', 'b');
    expect(isConnectorItem(connector)).toBe(true);
  });

  it('13.13 — returns false for a non-connector item', () => {
    const rect = makeItem('r', 'rectangle', 0, 0, 80, 60, {
      fillColor: '#000000',
      strokeColor: '#000000',
      strokeWidth: 1,
    });
    expect(isConnectorItem(rect)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13.14: DEFAULT_CONNECTOR_ATTRS
// ---------------------------------------------------------------------------

describe('DEFAULT_CONNECTOR_ATTRS', () => {
  it('13.14 — has correct default values', () => {
    expect(DEFAULT_CONNECTOR_ATTRS.fromAnchor).toBe('auto');
    expect(DEFAULT_CONNECTOR_ATTRS.toAnchor).toBe('auto');
    expect(DEFAULT_CONNECTOR_ATTRS.waypoints).toEqual([]);
    expect(DEFAULT_CONNECTOR_ATTRS.routing).toBe('straight');
    expect(DEFAULT_CONNECTOR_ATTRS.style.strokeColor).toBe('#ffffff');
    expect(DEFAULT_CONNECTOR_ATTRS.style.strokeWidth).toBe(2);
    expect(DEFAULT_CONNECTOR_ATTRS.style.arrowheadStart).toBe('none');
    expect(DEFAULT_CONNECTOR_ATTRS.style.arrowheadEnd).toBe('arrow');
    expect(DEFAULT_CONNECTOR_ATTRS.dangling).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13.15: ConnectorItemDefinition
// ---------------------------------------------------------------------------

describe('ConnectorItemDefinition', () => {
  it('13.15 — has correct type, layerKind, defaultSize, and function references', () => {
    expect(ConnectorItemDefinition.type).toBe('connector');
    expect(ConnectorItemDefinition.layerKind).toBe('connector');
    expect(ConnectorItemDefinition.defaultSize).toEqual({ width: 0, height: 0 });
    expect(typeof ConnectorItemDefinition.getBounds).toBe('function');
    expect(typeof ConnectorItemDefinition.hitTest).toBe('function');
    expect(ConnectorItemDefinition.defaultAttrs).toBe(DEFAULT_CONNECTOR_ATTRS);
    expect(ConnectorItemDefinition.schema).toBe(ConnectorAttrsSchema);
  });
});
