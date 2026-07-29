/**
 * FrameCreateTool — creates a frame item on the `frame` layer kind.
 * Mirrors the built-in rectangle tool but routes to the frame layer.
 *
 * The tool manages its own drag state internally (not via the controller's
 * dragState) so it can coexist with the built-in select/rectangle tools.
 */

import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

export class FrameCreateTool implements Tool {
  readonly name = 'frame';

  private dragging = false;
  private startX = 0;
  private startY = 0;
  private itemId: string | null = null;

  onPointerDown(event: PointerEventLite, ctx: ToolContext): void {
    const snapped = ctx.snap(event.point);
    this.startX = snapped.x;
    this.startY = snapped.y;
    this.dragging = true;

    this.itemId = ctx.createItem({
      type: 'frame',
      x: snapped.x,
      y: snapped.y,
      width: 20, // minimum 1 cell
      height: 20,
      attrs: {},
    });
  }

  onPointerMove(event: PointerEventLite, ctx: ToolContext): void {
    if (!this.dragging || !this.itemId) return;

    const x = Math.min(this.startX, event.point.x);
    const y = Math.min(this.startY, event.point.y);
    const w = Math.max(20, Math.abs(event.point.x - this.startX));
    const h = Math.max(20, Math.abs(event.point.y - this.startY));
    const snapped = ctx.snap({ x, y });
    const sw = Math.max(20, Math.round(w / 20) * 20);
    const sh = Math.max(20, Math.round(h / 20) * 20);

    ctx.updateItem(this.itemId, { x: snapped.x, y: snapped.y, width: sw, height: sh });
  }

  onPointerUp(_event: PointerEventLite, _ctx: ToolContext): void {
    this.dragging = false;
    this.itemId = null;
  }
}
