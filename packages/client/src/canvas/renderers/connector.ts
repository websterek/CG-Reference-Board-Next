/**
 * Connector renderer — PixiJS Graphics for the connector's rendered
 * path. Connectors live on the `connector` layer kind (above overlay,
 * below annotation).
 *
 * The renderer resolves endpoint positions from the live items map
 * (passed via `getItem`) so the connector follows its endpoints when
 * items move. Dangling connectors (one or both endpoints missing)
 * render with a red dashed stroke to visually distinguish them from
 * active connectors.
 *
 * Arrowhead triangles are drawn at the from/to anchor positions when
 * the corresponding `style.arrowheadStart`/`style.arrowheadEnd` is
 * `'arrow'`. Arrowhead size is 10px base / 8px height (per spec).
 *
 * PixiJS v8 `Graphics` extends `Container`, so the returned object is
 * itself a Container — consistent with other renderers in
 * `packages/client/src/canvas/renderers/`.
 */

import { Container, Graphics } from 'pixi.js';
import type { BoardItem, ConnectorAttrs, Point } from '@gridboard/domain';
import { resolveAnchor } from '@gridboard/domain';

const ARROWHEAD_BASE = 10;
const ARROWHEAD_HEIGHT = 8;
const DANGLING_COLOR = 0xff0000;
const PIN_RADIUS = 4;

/**
 * Render a connector as a `Container` containing a `Graphics` object
 * that draws the connector's path. The container is returned (not the
 * Graphics directly) so it can hold auxiliary visuals (e.g. the
 * endpoint pin dots) as siblings of the path Graphics.
 *
 * @param item   The connector item being rendered.
 * @param getItem  Lookup function to resolve endpoint item IDs to
 *                 `BoardItem` instances. The controller passes its
 *                 `this.items.get` so the connector follows live
 *                 endpoint positions.
 */
export function renderConnector(
  item: BoardItem,
  getItem: (id: string) => BoardItem | undefined,
): Container {
  const container = new Container();
  const attrs = (item.attrs ?? {}) as unknown as ConnectorAttrs;
  const fromItem = getItem(attrs.from);
  const toItem = getItem(attrs.to);
  const fromPt: Point = resolveAnchor(attrs.fromAnchor, fromItem);
  const toPt: Point = resolveAnchor(attrs.toAnchor, toItem);

  // Position the container at the path's first point and draw the
  // rest of the path relative to it. This keeps the rendered output
  // consistent with other renderers (which position the Container
  // at the item's `x`/`y`).
  const path = new Graphics();
  const isDangling = attrs.dangling || !fromItem || !toItem;
  const strokeColor = isDangling
    ? DANGLING_COLOR
    : parseColor(attrs.style.strokeColor);
  const strokeWidth = attrs.style.strokeWidth;
  const originX = fromPt.x;
  const originY = fromPt.y;

  path.setStrokeStyle({
    width: strokeWidth,
    color: strokeColor,
    alpha: isDangling ? 0.9 : 1,
    ...(isDangling ? { dashArray: [6, 4] } : {}),
  });
  path.moveTo(0, 0);
  // NOTE: v1 only implements 'straight' routing. Per design.md D7,
  // 'orthogonal' and 'curved' routing values are reserved for future
  // implementation. For now, all routing styles render as straight
  // line segments between consecutive path points (from anchor →
  // waypoints[0] → ... → waypoints[n] → to anchor). The data model
  // accepts the values so the schema does not need to migrate when
  // those routing styles are added.
  for (const wp of attrs.waypoints) {
    path.lineTo(wp.x - originX, wp.y - originY);
  }
  path.lineTo(toPt.x - originX, toPt.y - originY);
  path.stroke();

  // Arrowhead at the start (drawn relative to container origin).
  if (attrs.style.arrowheadStart === 'arrow') {
    const direction = firstSegmentDirection(fromPt, attrs.waypoints, toPt);
    drawArrowhead(path, 0, 0, -direction.x, -direction.y, strokeColor);
  }

  // Arrowhead at the end.
  if (attrs.style.arrowheadEnd === 'arrow') {
    const direction = lastSegmentDirection(fromPt, attrs.waypoints, toPt);
    const tipX = toPt.x - originX;
    const tipY = toPt.y - originY;
    drawArrowhead(path, tipX, tipY, direction.x, direction.y, strokeColor);
  }

  // Pin dots at endpoints (small circles). They are decorative for
  // the dangling marker but always rendered for consistency.
  path.setFillStyle({ color: isDangling ? DANGLING_COLOR : strokeColor, alpha: 1 });
  path.circle(0, 0, PIN_RADIUS);
  path.fill();
  path.circle(toPt.x - originX, toPt.y - originY, PIN_RADIUS);
  path.fill();

  path.position.set(0, 0);
  container.addChild(path);
  container.position.set(originX, originY);

  return container;
}

/**
 * Parse a CSS color string to a 24-bit integer for PixiJS Graphics.
 * Supports `#rgb` and `#rrggbb` (the spec uses the latter). Falls back
 * to white for anything unrecognized so the renderer never throws.
 */
function parseColor(value: string): number {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0]! + hex[0]!, 16);
      const g = parseInt(hex[1]! + hex[1]!, 16);
      const b = parseInt(hex[2]! + hex[2]!, 16);
      return (r << 16) | (g << 8) | b;
    }
    if (hex.length === 6) {
      return parseInt(hex, 16);
    }
  }
  return 0xffffff;
}

/**
 * Return the direction of the first segment (from anchor → first
 * waypoint, or from anchor → to anchor if there are no waypoints),
 * normalized to a unit vector.
 */
function firstSegmentDirection(
  from: Point,
  waypoints: ReadonlyArray<Point>,
  to: Point,
): Point {
  const next = waypoints[0] ?? to;
  const dx = next.x - from.x;
  const dy = next.y - from.y;
  return normalize({ x: dx, y: dy });
}

/**
 * Return the direction of the last segment (last waypoint → to
 * anchor, or from anchor → to anchor if there are no waypoints),
 * normalized to a unit vector.
 */
function lastSegmentDirection(
  from: Point,
  waypoints: ReadonlyArray<Point>,
  to: Point,
): Point {
  const prev = waypoints.length > 0 ? waypoints[waypoints.length - 1]! : from;
  const dx = to.x - prev.x;
  const dy = to.y - prev.y;
  return normalize({ x: dx, y: dy });
}

/**
 * Normalize a 2D vector to unit length. Returns the zero vector when
 * the input has zero length so callers can rely on the result being
 * finite (used to avoid division by zero in arrowhead orientation).
 */
function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Draw a filled triangle arrowhead at `(x, y)` pointing in the
 * direction `(dx, dy)` (must be a unit vector). The triangle has
 * its tip at `(x, y)` and extends back along the direction.
 */
function drawArrowhead(
  g: Graphics,
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: number,
): void {
  if (dx === 0 && dy === 0) return;
  // Perpendicular vector for the base of the triangle.
  const px = -dy;
  const py = dx;
  // Base center (back along the direction from the tip).
  const baseX = x - dx * ARROWHEAD_HEIGHT;
  const baseY = y - dy * ARROWHEAD_HEIGHT;
  // Two base vertices offset perpendicularly.
  const halfBase = ARROWHEAD_BASE / 2;
  const v1x = baseX + px * halfBase;
  const v1y = baseY + py * halfBase;
  const v2x = baseX - px * halfBase;
  const v2y = baseY - py * halfBase;

  g.setFillStyle({ color, alpha: 1 });
  g.moveTo(x, y);
  g.lineTo(v1x, v1y);
  g.lineTo(v2x, v2y);
  g.closePath();
  g.fill();
}
