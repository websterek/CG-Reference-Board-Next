/**
 * Rectangle renderer — PixiJS Graphics with fill + stroke.
 * Uses natural dimensions for display.
 */

import { Container, Graphics } from 'pixi.js';
import type { BoardItem } from '@gridboard/domain';

export function renderRectangle(item: BoardItem): Container {
  const g = new Graphics();
  const fillColor = (item.attrs as { fillColor?: string }).fillColor ?? '#4A90D9';
  const strokeColor = (item.attrs as { strokeColor?: string }).strokeColor ?? '#000000';
  const strokeWidth = (item.attrs as { strokeWidth?: number }).strokeWidth ?? 2;
  // Convert hex string to int
  const fillInt = parseInt(fillColor.slice(1), 16);
  const strokeInt = parseInt(strokeColor.slice(1), 16);
  g.rect(0, 0, item.width, item.height);
  g.fill({ color: fillInt });
  g.setStrokeStyle({ width: strokeWidth, color: strokeInt });
  g.stroke();
  g.position.set(item.x, item.y);
  // `width` and `height` accessors on Graphics expose measured bounds.
  void (g as unknown as { width?: number; height?: number });
  return g as unknown as Container;
}
