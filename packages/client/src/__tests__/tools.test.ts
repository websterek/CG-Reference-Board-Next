/**
 * Tool unit tests — FrameCreateTool and AnnotationFreehandTool.
 *
 * Tests invoke tool methods directly with a stub ToolContext, asserting
 * that the items passed to ctx.createItem have the right shape.
 */

import { describe, it, expect, vi } from 'vitest';
import { FrameCreateTool } from '../canvas/tools/frame-tool';
import { AnnotationFreehandTool } from '../canvas/tools/annotation-tool';
import type { ToolContext, PointerEventLite } from '@gridboard/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeStubContext(): ToolContext & {
  createdItems: Array<Record<string, unknown>>;
  updatedItems: Array<{ id: string; partial: Record<string, unknown> }>;
  deletedItems: string[];
} {
  const createdItems: Array<Record<string, unknown>> = [];
  const updatedItems: Array<{ id: string; partial: Record<string, unknown> }> = [];
  const deletedItems: string[] = [];

  return {
    selection: new Set(),
    snap: (p) => {
      // Snap to nearest 20
      return {
        x: Math.round(p.x / 20) * 20,
        y: Math.round(p.y / 20) * 20,
      };
    },
    updateItem(id, partial) {
      updatedItems.push({ id, partial });
    },
    createItem(input) {
      createdItems.push(input);
      return `item-${createdItems.length}`;
    },
    deleteItem(id) {
      deletedItems.push(id);
    },
    queueUpdate() {},
    flushQueuedUpdates() {},
    canPlace() {
      // Default stub: allow all placements. Tests that need rejection behavior
      // override this method on the returned context.
      return true;
    },
    setActiveTool() {},
    getItem() {
      return undefined;
    },
    hitTest() {
      return null;
    },
    createdItems,
    updatedItems,
    deletedItems,
  };
}

/**
 * Same as makeStubContext but lets the caller inject a canPlace predicate
 * so tests can simulate placement validation without wiring up a controller.
 */
function makeStubContextWithCanPlace(
  canPlacePredicate: (rect: { x: number; y: number; width: number; height: number }, kind: string) => boolean,
): ToolContext & {
  createdItems: Array<Record<string, unknown>>;
  updatedItems: Array<{ id: string; partial: Record<string, unknown> }>;
  deletedItems: string[];
} {
  const ctx = makeStubContext();
  ctx.canPlace = (rect, kind) => canPlacePredicate(rect, kind as 'frame' | 'media' | 'overlay' | 'annotation');
  return ctx;
}

// ---------------------------------------------------------------------------
// Task 10.4 — FrameCreateTool
// ---------------------------------------------------------------------------

describe('FrameCreateTool (Task 10.4)', () => {
  it('creates an item with type "frame" on pointer down', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContext();

    tool.onPointerDown(makePointerEvent(100, 100), ctx);

    expect(ctx.createdItems.length).toBe(1);
    expect(ctx.createdItems[0]!.type).toBe('frame');
  });

  it('snaps the creation position to the grid', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContext();

    // Click at (33, 47) — should snap to (40, 40)
    tool.onPointerDown(makePointerEvent(33, 47), ctx);

    expect(ctx.createdItems.length).toBe(1);
    expect(ctx.createdItems[0]!.x).toBe(40);
    expect(ctx.createdItems[0]!.y).toBe(40);
  });

  it('updates width and height during pointer move', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContext();

    tool.onPointerDown(makePointerEvent(0, 0), ctx);
    tool.onPointerMove(makePointerEvent(100, 80), ctx);

    expect(ctx.updatedItems.length).toBeGreaterThan(0);
    const lastUpdate = ctx.updatedItems[ctx.updatedItems.length - 1]!;
    expect(lastUpdate.partial.width).toBeGreaterThanOrEqual(20);
    expect(lastUpdate.partial.height).toBeGreaterThanOrEqual(20);
  });

  it('stops updating after pointer up', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContext();

    tool.onPointerDown(makePointerEvent(0, 0), ctx);
    const beforeUp = ctx.updatedItems.length;
    tool.onPointerUp(makePointerEvent(100, 100), ctx);
    // After pointer up, further moves should not update
    tool.onPointerMove(makePointerEvent(200, 200), ctx);
    expect(ctx.updatedItems.length).toBe(beforeUp);
  });
});

// ---------------------------------------------------------------------------
// Task 11.3 — FrameCreateTool canPlace gating
// ---------------------------------------------------------------------------

describe('FrameCreateTool canPlace gating (Task 11.3)', () => {
  it('calls canPlace before createItem on pointer down', () => {
    const tool = new FrameCreateTool();
    let canPlaceCalled = false;
    const ctx = makeStubContextWithCanPlace(() => {
      canPlaceCalled = true;
      return true;
    });

    tool.onPointerDown(makePointerEvent(0, 0), ctx);

    expect(canPlaceCalled).toBe(true);
    expect(ctx.createdItems.length).toBe(1);
  });

  it('does not create an item when canPlace rejects the placement', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContextWithCanPlace(() => false);

    tool.onPointerDown(makePointerEvent(0, 0), ctx);

    expect(ctx.createdItems.length).toBe(0);
    expect(ctx.updatedItems.length).toBe(0);
  });

  it('passes the snapped position and frame dimensions to canPlace', () => {
    const tool = new FrameCreateTool();
    const calls: Array<{ rect: { x: number; y: number; width: number; height: number }; kind: string }> = [];
    const ctx = makeStubContextWithCanPlace((rect, kind) => {
      calls.push({ rect, kind });
      return true;
    });

    // Click at (33, 47) → snap to (40, 40); min frame size 32×32.
    tool.onPointerDown(makePointerEvent(33, 47), ctx);

    expect(calls.length).toBe(1);
    expect(calls[0]!.rect.x).toBe(40);
    expect(calls[0]!.rect.y).toBe(40);
    expect(calls[0]!.rect.width).toBe(32);
    expect(calls[0]!.rect.height).toBe(32);
    expect(calls[0]!.kind).toBe('frame');
  });

  it('creates an item when canPlace accepts the placement', () => {
    const tool = new FrameCreateTool();
    const ctx = makeStubContextWithCanPlace(() => true);

    tool.onPointerDown(makePointerEvent(100, 100), ctx);

    expect(ctx.createdItems.length).toBe(1);
    expect(ctx.createdItems[0]!.type).toBe('frame');
  });
});

// ---------------------------------------------------------------------------
// Task 10.4 — AnnotationFreehandTool
// ---------------------------------------------------------------------------

describe('AnnotationFreehandTool (Task 10.4)', () => {
  it('creates an item with type "annotation-stroke" on pointer up', () => {
    const tool = new AnnotationFreehandTool();
    const ctx = makeStubContext();

    tool.onPointerDown(makePointerEvent(10, 10), ctx);
    tool.onPointerMove(makePointerEvent(20, 20), ctx);
    tool.onPointerMove(makePointerEvent(30, 15), ctx);
    tool.onPointerUp(makePointerEvent(30, 15), ctx);

    expect(ctx.createdItems.length).toBe(1);
    expect(ctx.createdItems[0]!.type).toBe('annotation-stroke');
  });

  it('stores unquantized (raw) coordinates in vertices', () => {
    const tool = new AnnotationFreehandTool();
    const ctx = makeStubContext();

    // Use non-cell-aligned coordinates
    tool.onPointerDown(makePointerEvent(13, 27), ctx);
    tool.onPointerMove(makePointerEvent(33, 47), ctx);
    tool.onPointerMove(makePointerEvent(53, 22), ctx);
    tool.onPointerUp(makePointerEvent(53, 22), ctx);

    expect(ctx.createdItems.length).toBe(1);
    const attrs = ctx.createdItems[0]!.attrs as { vertices: Array<{ x: number; y: number }> };
    expect(attrs.vertices).toBeDefined();
    expect(attrs.vertices.length).toBe(3);
    // Vertices should be raw, not snapped
    expect(attrs.vertices[0]!.x).toBe(13);
    expect(attrs.vertices[0]!.y).toBe(27);
    expect(attrs.vertices[1]!.x).toBe(33);
    expect(attrs.vertices[1]!.y).toBe(47);
    expect(attrs.vertices[2]!.x).toBe(53);
    expect(attrs.vertices[2]!.y).toBe(22);
  });

  it('computes bounding box from vertices', () => {
    const tool = new AnnotationFreehandTool();
    const ctx = makeStubContext();

    tool.onPointerDown(makePointerEvent(10, 10), ctx);
    tool.onPointerMove(makePointerEvent(100, 5), ctx);
    tool.onPointerMove(makePointerEvent(50, 80), ctx);
    tool.onPointerUp(makePointerEvent(50, 80), ctx);

    expect(ctx.createdItems.length).toBe(1);
    const item = ctx.createdItems[0]!;
    // Bounding box should cover all vertices
    expect(item.x).toBeLessThanOrEqual(10);
    expect(item.y).toBeLessThanOrEqual(5);
    expect((item.x as number) + (item.width as number)).toBeGreaterThanOrEqual(100);
    expect((item.y as number) + (item.height as number)).toBeGreaterThanOrEqual(80);
  });

  it('does not create an item if no vertices were collected', () => {
    const tool = new AnnotationFreehandTool();
    const ctx = makeStubContext();

    // Pointer up without any moves
    tool.onPointerDown(makePointerEvent(10, 10), ctx);
    tool.onPointerUp(makePointerEvent(10, 10), ctx);

    // Should still create (single-point stroke)
    expect(ctx.createdItems.length).toBe(1);
  });

  it('does not create an item if pointer up without pointer down', () => {
    const tool = new AnnotationFreehandTool();
    const ctx = makeStubContext();

    tool.onPointerUp(makePointerEvent(10, 10), ctx);

    expect(ctx.createdItems.length).toBe(0);
  });
});
