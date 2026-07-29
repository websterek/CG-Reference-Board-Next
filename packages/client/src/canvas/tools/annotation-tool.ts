/**
 * AnnotationFreehandTool — collects pointer-move vertices at raw board
 * coordinates and creates a single annotation-stroke item on pointer up.
 *
 * Annotations live on the `annotation` layer kind (topmost, no snap, no
 * overlap enforcement). Vertices are stored unquantized.
 */

import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

export class AnnotationFreehandTool implements Tool {
  readonly name = 'annotation-freehand';

  private drawing = false;
  private vertices: Array<{ x: number; y: number }> = [];

  onPointerDown(event: PointerEventLite, _ctx: ToolContext): void {
    this.drawing = true;
    this.vertices = [{ x: event.point.x, y: event.point.y }];
  }

  onPointerMove(event: PointerEventLite, _ctx: ToolContext): void {
    if (!this.drawing) return;
    this.vertices.push({ x: event.point.x, y: event.point.y });
  }

  onPointerUp(_event: PointerEventLite, ctx: ToolContext): void {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.vertices.length === 0) return;

    // Compute bounding box from vertices
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const v of this.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    ctx.createItem({
      type: 'annotation-stroke',
      x: minX,
      y: minY,
      width,
      height,
      attrs: { vertices: [...this.vertices] },
    });

    this.vertices = [];
  }
}
