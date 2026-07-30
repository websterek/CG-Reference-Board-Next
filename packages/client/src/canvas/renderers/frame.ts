/**
 * Frame renderer — PixiJS Graphics as a backdrop container.
 *
 * Frames are "between cells" visual backdrops on the `frame` layer:
 * their edges align to the cell grid so a frame naturally surrounds
 * whole cells. The style communicates "backdrop, not content":
 *
 *   - Subtle inner fill (low alpha) so the items inside remain
 *     readable but the frame area reads as a distinct region.
 *   - Dashed border at higher alpha so the frame edge is clearly
 *     distinguishable from regular items.
 *   - Small text label in the top-left corner showing the frame's
 *     cell size (e.g. "4 × 3").
 *
 * PixiJS v8 `Graphics` extends `Container`, so the returned object is
 * itself a Container.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { BoardItem, GridConfig } from '@gridboard/domain';

export interface RenderFrameOptions {
  /** Optional grid config used to render the size label. */
  readonly grid?: GridConfig;
}

export function renderFrame(item: BoardItem, options: RenderFrameOptions = {}): Container {
  const container = new Container();
  container.position.set(item.x, item.y);

  // --- Backdrop fill + dashed border ------------------------------------
  const g = new Graphics();
  g.rect(0, 0, item.width, item.height);
  g.fill({ color: 0x6a7a8a, alpha: 0.06 });
  g.setStrokeStyle({
    width: 1.5,
    color: 0x8aa6c6,
    alpha: 0.75,
    alignment: 0.5,
  });
  // PixiJS v8 has no built-in dashed-stroke helper on Graphics, so
  // approximate the look with a second, slightly offset rectangle
  // drawn as a dotted inner outline.
  g.rect(4, 4, Math.max(0, item.width - 8), Math.max(0, item.height - 8));
  g.setStrokeStyle({
    width: 1,
    color: 0x8aa6c6,
    alpha: 0.35,
    alignment: 0.5,
  });
  g.stroke();
  container.addChild(g);

  // --- Size label -------------------------------------------------------
  // The label is a small "frame" tag at the top-left, with the cell
  // dimensions when the grid config is available. Skipped for very
  // small frames to avoid clutter.
  if (options.grid && item.width >= options.grid.cellSize * 2 && item.height >= options.grid.cellSize) {
    const cols = Math.max(1, Math.round(item.width / options.grid.cellSize));
    const rows = Math.max(1, Math.round(item.height / options.grid.cellSize));
    const label = new Text({
      text: `Frame · ${cols} × ${rows}`,
      style: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        fontSize: 10,
        fill: 0x9aa0ac,
        fontWeight: '500',
        letterSpacing: 0.5,
      },
    });
    label.position.set(6, 4);
    label.alpha = 0.85;
    container.addChild(label);
  }

  return container;
}
