/**
 * HandTool — first-class pan tool.
 *
 * Implements the `Tool` interface so it lives in the controller's
 * `toolRegistry` alongside FrameCreateTool and AnnotationFreehandTool.
 * Dragging with Hand active pans the camera.
 *
 * NOTE (tool-registry-and-modes proposal D3): spacebar pan still works
 * when Hand tool is NOT active. The controller's input handler checks
 * `this.spacebar` before dispatching to the tool registry, so the two
 * mechanisms coexist.
 *
 * Tool lifecycle:
 *   onActivate — set canvas cursor to 'grab'.
 *   onDeactivate — reset canvas cursor to 'default'.
 *   onPointerDown — record start screen point; cursor becomes 'grabbing'.
 *   onPointerMove — if dragging, compute delta and pan via ctx.
 *   onPointerUp — stop dragging; cursor back to 'grab'.
 */

import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

/**
 * Minimal extension to `ToolContext` exposing a `pan(dx, dy)` method.
 * The CanvasController builds the ToolContext (see controller.ts
 * `buildToolContext`) and now provides `pan` as part of the contract.
 *
 * We import the structural shape here to avoid extending the domain
 * ToolContext interface for one tool.
 */
type PanCapableContext = ToolContext & {
  pan(dx: number, dy: number): void;
  /** Set the canvas cursor (used by the controller to manage cursor style). */
  setCanvasCursor?(cursor: 'grab' | 'grabbing' | 'default' | string): void;
};

export class HandTool implements Tool {
  readonly name = 'hand';

  private dragging = false;
  private startScreenX = 0;
  private startScreenY = 0;
  private lastScreenX = 0;
  private lastScreenY = 0;

  onActivate(ctx: PanCapableContext): void {
    if (ctx.setCanvasCursor) ctx.setCanvasCursor('grab');
  }

  onDeactivate(ctx: PanCapableContext): void {
    if (ctx.setCanvasCursor) ctx.setCanvasCursor('default');
  }

  onPointerDown(event: PointerEventLite, ctx: PanCapableContext): void {
    this.dragging = true;
    // The ToolContext does not currently expose a screen-space point,
    // but the controller feeds board-space into `event.point`. For
    // panning we work in screen space so the pan feels direct. The
    // controller's ToolContext builder is responsible for providing a
    // screen-space accessor on `ctx`; if absent, fall back to board
    // coords (delta still pans, just with the camera-zoom factor).
    const p = (ctx as unknown as { screenPoint?: { x: number; y: number } })
      .screenPoint ?? { x: event.point.x, y: event.point.y };
    this.startScreenX = p.x;
    this.startScreenY = p.y;
    this.lastScreenX = p.x;
    this.lastScreenY = p.y;
    if (ctx.setCanvasCursor) ctx.setCanvasCursor('grabbing');
  }

  onPointerMove(event: PointerEventLite, ctx: PanCapableContext): void {
    if (!this.dragging) return;
    const p = (ctx as unknown as { screenPoint?: { x: number; y: number } })
      .screenPoint ?? { x: event.point.x, y: event.point.y };
    const dx = p.x - this.lastScreenX;
    const dy = p.y - this.lastScreenY;
    this.lastScreenX = p.x;
    this.lastScreenY = p.y;
    ctx.pan(dx, dy);
  }

  onPointerUp(_event: PointerEventLite, ctx: PanCapableContext): void {
    this.dragging = false;
    if (ctx.setCanvasCursor) ctx.setCanvasCursor('grab');
  }
}