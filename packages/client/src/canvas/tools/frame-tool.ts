/**
 * FrameCreateTool — creates a frame item on the `frame` layer kind.
 * Mirrors the built-in rectangle tool but routes to the frame layer.
 *
 * The tool manages its own drag state internally (not via the controller's
 * dragState) so it can coexist with the built-in select/rectangle tools.
 */

import type { LayerKind, Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

const FRAME_MIN_SIZE = 20; // 1 cell
const FRAME_KIND: LayerKind = 'frame';

export class FrameCreateTool implements Tool {
  readonly name = 'frame';

  private dragging = false;
  private startX = 0;
  private startY = 0;
  private itemId: string | null = null;

  onPointerDown(event: PointerEventLite, ctx: ToolContext): void {
    const snapped = ctx.snap(event.point);

    // Validate placement before creating the item. A frame occupies a 1×1
    // cell footprint at the snap point; reject if a same-kind item already
    // occupies that cell. If rejected, do not create the frame.
    const proposed = {
      x: snapped.x,
      y: snapped.y,
      width: FRAME_MIN_SIZE,
      height: FRAME_MIN_SIZE,
    };
    if (!ctx.canPlace(proposed, FRAME_KIND)) {
      this.dragging = false;
      this.itemId = null;
      return;
    }

    this.startX = snapped.x;
    this.startY = snapped.y;
    this.dragging = true;

    this.itemId = ctx.createItem({
      type: 'frame',
      x: snapped.x,
      y: snapped.y,
      width: FRAME_MIN_SIZE, // minimum 1 cell
      height: FRAME_MIN_SIZE,
      attrs: {},
    });
  }

  onPointerMove(event: PointerEventLite, ctx: ToolContext): void {
    if (!this.dragging || !this.itemId) return;

    const x = Math.min(this.startX, event.point.x);
    const y = Math.min(this.startY, event.point.y);
    const w = Math.max(FRAME_MIN_SIZE, Math.abs(event.point.x - this.startX));
    const h = Math.max(FRAME_MIN_SIZE, Math.abs(event.point.y - this.startY));
    const snapped = ctx.snap({ x, y });
    const sw = Math.max(FRAME_MIN_SIZE, Math.round(w / FRAME_MIN_SIZE) * FRAME_MIN_SIZE);
    const sh = Math.max(FRAME_MIN_SIZE, Math.round(h / FRAME_MIN_SIZE) * FRAME_MIN_SIZE);

    ctx.updateItem(this.itemId, { x: snapped.x, y: snapped.y, width: sw, height: sh });
  }

  onPointerUp(_event: PointerEventLite, _ctx: ToolContext): void {
    this.dragging = false;
    this.itemId = null;
  }
}
