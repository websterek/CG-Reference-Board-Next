/**
 * HandTool unit tests — panning, cursor management (Task 14.8).
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import { HandTool } from '../canvas/tools/hand-tool';
import type { ToolContext, PointerEventLite } from '@gridboard/domain';

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

function makeMockCtx() {
  return {
    selection: new Set<string>(),
    snap: vi.fn((p) => p),
    updateItem: vi.fn(),
    createItem: vi.fn(),
    deleteItem: vi.fn(),
    queueUpdate: vi.fn(),
    flushQueuedUpdates: vi.fn(),
    canPlace: vi.fn(() => true),
    setActiveTool: vi.fn(),
    pan: vi.fn(),
    setCanvasCursor: vi.fn(),
  } as unknown as ToolContext & {
    pan: ReturnType<typeof vi.fn>;
    setCanvasCursor: ReturnType<typeof vi.fn>;
  };
}

describe('HandTool (Task 14.8)', () => {
  it('onActivate sets cursor to grab', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    tool.onActivate!(ctx);

    expect(ctx.setCanvasCursor).toHaveBeenCalledWith('grab');
  });

  it('onPointerDown sets cursor to grabbing', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    tool.onPointerDown!(makePointerEvent(100, 100), ctx);

    expect(ctx.setCanvasCursor).toHaveBeenCalledWith('grabbing');
  });

  it('onPointerMove pans the camera by delta', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    // Start drag at (100, 100)
    tool.onPointerDown!(makePointerEvent(100, 100), ctx);
    // Move to (150, 120) — delta = (50, 20)
    tool.onPointerMove!(makePointerEvent(150, 120), ctx);

    expect(ctx.pan).toHaveBeenCalledWith(50, 20);
  });

  it('onPointerMove does not pan when not dragging', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    // Move without pointer down first
    tool.onPointerMove!(makePointerEvent(150, 120), ctx);

    expect(ctx.pan).not.toHaveBeenCalled();
  });

  it('onPointerUp sets cursor back to grab', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    tool.onPointerDown!(makePointerEvent(100, 100), ctx);
    tool.onPointerUp!(makePointerEvent(150, 120), ctx);

    expect(ctx.setCanvasCursor).toHaveBeenCalledWith('grab');
  });

  it('onDeactivate sets cursor to default', () => {
    const tool = new HandTool();
    const ctx = makeMockCtx();

    tool.onDeactivate!(ctx);

    expect(ctx.setCanvasCursor).toHaveBeenCalledWith('default');
  });

  it('name is hand', () => {
    const tool = new HandTool();
    expect(tool.name).toBe('hand');
  });

  it('implements Tool interface methods', () => {
    const tool = new HandTool();
    expect(typeof tool.onActivate).toBe('function');
    expect(typeof tool.onDeactivate).toBe('function');
    expect(typeof tool.onPointerDown).toBe('function');
    expect(typeof tool.onPointerMove).toBe('function');
    expect(typeof tool.onPointerUp).toBe('function');
  });
});
