/**
 * Annotation renderer — PixiJS Graphics polyline through stored vertices.
 * Annotations live on the `annotation` layer kind (topmost, no snap).
 *
 * PixiJS v8 `Graphics` extends `Container`, so the returned object is itself
 * a Container — no cast required.
 */

import { Container, Graphics } from 'pixi.js';
import type { BoardItem, AnnotationAttrs } from '@gridboard/domain';

export function renderAnnotation(item: BoardItem): Container {
  const attrs = (item.attrs ?? {}) as unknown as AnnotationAttrs;
  const verts = attrs.vertices ?? [];
  const g = new Graphics();

  if (verts.length === 0) {
    // Empty stroke — render a tiny placeholder so the item is visible in the tree
    g.rect(0, 0, 1, 1);
    g.fill({ color: 0xff0000, alpha: 0.3 });
    g.position.set(item.x, item.y);
    return g;
  }

  // Draw polyline through vertices, relative to the first vertex
  const originX = verts[0]!.x;
  const originY = verts[0]!.y;
  g.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.9 });
  g.moveTo(0, 0);
  for (let i = 1; i < verts.length; i++) {
    g.lineTo(verts[i]!.x - originX, verts[i]!.y - originY);
  }
  g.stroke();
  g.position.set(originX, originY);
  return g;
}
