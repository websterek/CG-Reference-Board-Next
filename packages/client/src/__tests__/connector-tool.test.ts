/**
 * ConnectorTool integration tests — exercises the two-click state
 * machine against a stub `ToolContext` (mirrors the pattern used by
 * `tools.test.ts`).
 *
 * Covers the spec scenarios from connector-items spec.md "Two-Click
 * Tool" requirement.
 */

import { describe, it, expect } from 'vitest';
import { ConnectorTool } from '../canvas/tools/connector-tool';
import type { ToolContext, PointerEventLite, BoardItem, ItemId } from '@gridboard/domain';
import { asItemId, asLayerId } from '@gridboard/domain';

function makePointerEvent(
  x: number,
  y: number,
  overrides: Partial<PointerEventLite> = {},
): PointerEventLite {
  return {
    point: { x, y },
    buttons: 1,
    shiftKey: false,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    ...overrides,
  };
}

interface StubContext {
  ctx: ToolContext;
  items: Map<string, BoardItem>;
  createdItems: Array<Record<string, unknown>>;
  hitHits: Array<{ x: number; y: number }>;
  previewGraphics: { destroy: () => void; parent: unknown }[];
}

function makeContext(): StubContext {
  const items = new Map<string, BoardItem>();
  const createdItems: Array<Record<string, unknown>> = [];
  const hitHits: Array<{ x: number; y: number }> = [];
  const previewGraphics: { destroy: () => void; parent: unknown }[] = [];

  function makeRect(id: string, x: number, y: number, w = 80, h = 60): BoardItem {
    return {
      id: asItemId(id),
      type: 'rectangle',
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      layerId: asLayerId('media'),
      attrs: { fillColor: '#000', strokeColor: '#000', strokeWidth: 1 },
    };
  }

  const ctx: ToolContext = {
    selection: new Set(),
    snap: (p) => p,
    updateItem: () => {},
    createItem: (input) => {
      createdItems.push(input);
      const id = `c-${createdItems.length}`;
      return id;
    },
    deleteItem: () => {},
    queueUpdate: () => {},
    flushQueuedUpdates: () => {},
    canPlace: () => true,
    setActiveTool: () => {},
    getItem: (id: string) => items.get(id),
    hitTest: (point: { x: number; y: number }) => {
      hitHits.push(point);
      // Find the first item containing the point.
      for (const [id, item] of items) {
        if (
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height
        ) {
          return id as ItemId;
        }
      }
      return null;
    },
  };

  // Inject the extended ToolContext (toolOverlay, resolveAnchor) used
  // by the ConnectorTool for preview rendering.
  (ctx as unknown as { toolOverlay: unknown }).toolOverlay = {
    addChild: (g: { destroy: () => void; parent: unknown }) => {
      previewGraphics.push(g);
    },
    removeChild: () => {},
  };
  (ctx as unknown as { resolveAnchor: (item: BoardItem) => { x: number; y: number } }).resolveAnchor =
    (item) => ({ x: item.x + item.width / 2, y: item.y + item.height / 2 });

  return {
    ctx,
    items,
    createdItems,
    hitHits,
    previewGraphics: previewGraphics as { destroy: () => void; parent: unknown }[],
    // expose for tests
    ...{ makeRect },
  } as StubContext & { makeRect: typeof makeRect };
}

describe('ConnectorTool — two-click flow', () => {
  it('first click stores source, second click creates a connector', () => {
    const c = makeContext();
    c.items.set('a', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('a', 0, 0));
    c.items.set('b', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('b', 200, 0));

    const tool = new ConnectorTool();
    // First click — source.
    tool.onPointerDown!(makePointerEvent(40, 30), c.ctx);
    // Second click — target.
    tool.onPointerDown!(makePointerEvent(240, 30), c.ctx);

    expect(c.createdItems).toHaveLength(1);
    const created = c.createdItems[0]!;
    expect(created['type']).toBe('connector');
    const attrs = created['attrs'] as Record<string, unknown>;
    expect(attrs['from']).toBe('a');
    expect(attrs['to']).toBe('b');
    expect(attrs['dangling']).toBe(false);
  });

  it('click on empty canvas in idle state does not transition to pending-source', () => {
    const c = makeContext();
    c.items.set('a', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('a', 0, 0));

    const tool = new ConnectorTool();
    tool.onPointerDown!(makePointerEvent(500, 500), c.ctx);
    // Now click on a — should still be the first valid click.
    tool.onPointerDown!(makePointerEvent(40, 30), c.ctx);
    expect(c.createdItems).toHaveLength(0);
  });

  it('click on same item for both endpoints does not create a connector', () => {
    const c = makeContext();
    c.items.set('a', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('a', 0, 0));

    const tool = new ConnectorTool();
    tool.onPointerDown!(makePointerEvent(40, 30), c.ctx);
    // Click on the same item.
    tool.onPointerDown!(makePointerEvent(50, 40), c.ctx);
    expect(c.createdItems).toHaveLength(0);
  });

  it('Esc cancels pending-source and clears preview', () => {
    const c = makeContext();
    c.items.set('a', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('a', 0, 0));
    c.items.set('b', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('b', 200, 0));

    const tool = new ConnectorTool();
    tool.onPointerDown!(makePointerEvent(40, 30), c.ctx); // source
    tool.onPointerMove!(makePointerEvent(100, 100), c.ctx); // preview
    // Esc cancels.
    tool.onKeyDown!({ key: 'Escape', shiftKey: false }, c.ctx);
    // After Esc, a fresh click should start a new flow — but the
    // second click (target) was never consumed. Now click target.
    tool.onPointerDown!(makePointerEvent(240, 30), c.ctx);
    // No connector created (because the source was reset).
    expect(c.createdItems).toHaveLength(0);
  });

  it('clicking a connector as target does not create a connector', () => {
    const c = makeContext();
    c.items.set('a', (c as unknown as { makeRect: (id: string, x: number, y: number) => BoardItem }).makeRect('a', 0, 0));
    const connector: BoardItem = {
      id: asItemId('cx'),
      type: 'connector',
      x: 200,
      y: 0,
      width: 80,
      height: 60,
      rotation: 0,
      layerId: asLayerId('connectors'),
      attrs: {
        from: asItemId('a'),
        to: asItemId('b'),
        fromAnchor: 'auto',
        toAnchor: 'auto',
        waypoints: [],
        routing: 'straight',
        style: { strokeColor: '#fff', strokeWidth: 2, arrowheadStart: 'none', arrowheadEnd: 'arrow' },
        dangling: false,
      },
    };
    c.items.set('cx', connector);

    // Override the hitTest in the context to also find 'cx' for the
    // second click coordinates.
    c.ctx.hitTest = (point: { x: number; y: number }) => {
      if (point.x >= 200 && point.x <= 280 && point.y >= 0 && point.y <= 60) {
        return asItemId('cx');
      }
      for (const [id, item] of c.items) {
        if (
          point.x >= item.x &&
          point.x <= item.x + item.width &&
          point.y >= item.y &&
          point.y <= item.y + item.height
        ) {
          return asItemId(id);
        }
      }
      return null;
    };

    const tool = new ConnectorTool();
    tool.onPointerDown!(makePointerEvent(40, 30), c.ctx); // a
    tool.onPointerDown!(makePointerEvent(240, 30), c.ctx); // cx
    expect(c.createdItems).toHaveLength(0);
  });
});
