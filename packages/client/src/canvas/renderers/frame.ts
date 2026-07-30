/**
 * Frame renderer — PixiJS Graphics with a dashed/dotted border style.
 * Frames are visual markers on the `frame` layer kind.
 *
 * PixiJS v8 `Graphics` extends `Container`, so the returned object is itself
 * a Container — no cast required.
 */

import { Container, Graphics } from 'pixi.js';
import type { BoardItem } from '@gridboard/domain';

export function renderFrame(item: BoardItem): Container {
  const g = new Graphics();
  // Frame: semi-transparent fill with a distinct border
  g.rect(0, 0, item.width, item.height);
  g.fill({ color: 0x3a4a5a, alpha: 0.15 });
  g.setStrokeStyle({ width: 2, color: 0x5a7a9a, alpha: 0.8 });
  g.stroke();
  g.position.set(item.x, item.y);
  return g;
}
