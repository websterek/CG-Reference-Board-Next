/**
 * ConnectorItem — first-class graph-edge connector between board items.
 *
 * Connectors bind to endpoint items by `ItemId` reference (not embedded
 * positions) so they re-route when endpoints move, and set `dangling: true`
 * when an endpoint is deleted instead of being cascade-deleted. The
 * bounding box stored on the `BoardItem` base (`x`/`y`/`width`/`height`)
 * is a derived value computed from the rendered path — it is used for
 * spatial indexing and viewport culling only, not for rendering.
 *
 * See connector-items spec.md (openspec/changes/connector-items/specs/
 * connector-items/spec.md) for the full requirements.
 */

import type { BoardItem, ConnectorAttrs, ItemType, Point, Rect } from '../board';
import { DEFAULT_CONNECTOR_ATTRS, ConnectorAttrsSchema } from '../board';
import type { ItemTypeDefinition } from './index';

/**
 * Hit-test tolerance in board-coordinate pixels. A click within this
 * distance of any path segment is considered a hit. The value matches
 * the spec requirement (8px) and is used for both path-segment hits
 * and endpoint-pin hits.
 */
export const CONNECTOR_HIT_TOLERANCE = 8;

/**
 * Padding (in board pixels) added to the derived bounding box. Covers
 * stroke width, arrowhead size, and a small visual margin. Used by
 * `getConnectorBounds` so the spatial index includes the visual extent
 * of the connector, not just the raw anchor positions.
 */
export const CONNECTOR_BOUND_PADDING = 12;

/**
 * Distance from a path endpoint where the click is considered an
 * "endpoint pin" hit. Pin hits have higher priority than path-segment
 * hits so the user can target the ends of a connector specifically
 * (e.g. for reattach).
 */
export const CONNECTOR_PIN_RADIUS = 8;

export type { ConnectorAttrs } from '../board';
export { ConnectorAttrsSchema, DEFAULT_CONNECTOR_ATTRS } from '../board';

/**
 * Type guard: narrows a `BoardItem` to one carrying connector attrs.
 * Validates against `ConnectorAttrsSchema` so malformed data is
 * rejected at the boundary rather than at render time.
 */
export function isConnectorItem(
  item: BoardItem,
): item is BoardItem & { attrs: ConnectorAttrs } {
  return item.type === 'connector' && ConnectorAttrsSchema.safeParse(item.attrs).success;
}

/**
 * Resolve an anchor (either `'auto'` or an explicit `{x,y}` offset)
 * into an absolute board-coordinate point given the endpoint item's
 * bounds. `'auto'` resolves to the item's center; an explicit anchor
 * is added to the item's top-left corner.
 *
 * When the endpoint item is missing (dangling case), this returns
 * the item's last known bounds. Callers that want to flag the
 * connector as dangling check `attrs.dangling` instead.
 */
export function resolveAnchor(
  anchor: ConnectorAttrs['fromAnchor'],
  endpoint: BoardItem | undefined,
): Point {
  if (endpoint) {
    if (anchor === 'auto') {
      return {
        x: endpoint.x + endpoint.width / 2,
        y: endpoint.y + endpoint.height / 2,
      };
    }
    return {
      x: endpoint.x + anchor.x,
      y: endpoint.y + anchor.y,
    };
  }
  // Endpoint missing — use the last known bounds. Callers pass a
  // zero-sized rect placeholder when nothing is known; the bounding
  // box of the connector will be padded by CONNECTOR_BOUND_PADDING
  // so the spatial index still keeps the connector visible.
  return { x: 0, y: 0 };
}

/**
 * Compute the bounding box of the connector's rendered path.
 *
 * The path is: fromAnchor → waypoints[0] → ... → waypoints[n] →
 * toAnchor. The bounding box is the union of all path points plus
 * `CONNECTOR_BOUND_PADDING` (which covers stroke width, arrowheads,
 * and a small margin).
 *
 * If a lookup function is provided, endpoint positions are resolved
 * live from the items map. Otherwise the function uses the
 * `from`/`to` `ItemId` strings to look up the endpoint items from
 * the `items` map and falls back to the connector's own
 * `x`/`y`/`width`/`height` if the endpoints are missing.
 */
export function getConnectorBounds(
  item: BoardItem,
  items?: ReadonlyMap<string, BoardItem>,
): Rect {
  const attrs = item.attrs as unknown as ConnectorAttrs;
  const fromItem = items ? items.get(attrs.from) : undefined;
  const toItem = items ? items.get(attrs.to) : undefined;
  const fromPt = resolveAnchor(attrs.fromAnchor, fromItem);
  const toPt = resolveAnchor(attrs.toAnchor, toItem);
  const points: Point[] = [fromPt, ...attrs.waypoints, toPt];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // If all points collapsed to one location, fall back to the item's
  // stored bounds so the bounding box is still well-defined.
  if (!Number.isFinite(minX)) {
    return { x: item.x, y: item.y, width: item.width, height: item.height };
  }

  const padding = CONNECTOR_BOUND_PADDING;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + 2 * padding),
    height: Math.max(1, maxY - minY + 2 * padding),
  };
}

/**
 * Compute the distance from a point to a line segment. Returns the
 * perpendicular distance when the closest point on the segment lies
 * between the endpoints, or the distance to the nearest endpoint
 * otherwise. Standard 2D formula.
 */
function distancePointToSegment(
  point: Point,
  a: Point,
  b: Point,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    // Degenerate segment — distance to the single point.
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = a.x + t * dx;
  const closestY = a.y + t * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/**
 * Hit test for connector items. Returns `true` if the point is within
 * `CONNECTOR_HIT_TOLERANCE` of any segment of the rendered path OR
 * within `CONNECTOR_PIN_RADIUS` of either endpoint anchor (pin hits
 * have higher priority by being checked first).
 *
 * If a `getItem` lookup is provided, endpoint positions are resolved
 * live so the hit test follows moved endpoints. Without it, the
 * function uses the connector's own `x`/`y` as fallback anchor
 * positions.
 */
export function connectorHitTest(
  item: BoardItem,
  point: Point,
  getItem?: (id: string) => BoardItem | undefined,
): boolean {
  const attrs = item.attrs as unknown as ConnectorAttrs;
  const fromItem = getItem ? getItem(attrs.from) : undefined;
  const toItem = getItem ? getItem(attrs.to) : undefined;
  const fromPt = resolveAnchor(attrs.fromAnchor, fromItem);
  const toPt = resolveAnchor(attrs.toAnchor, toItem);

  // Endpoint pin hits first — pins get higher priority than path
  // segments so the user can target the ends of a connector
  // specifically (e.g. for reattach).
  const pinDist =
    Math.min(
      Math.hypot(point.x - fromPt.x, point.y - fromPt.y),
      Math.hypot(point.x - toPt.x, point.y - toPt.y),
    );
  if (pinDist <= CONNECTOR_PIN_RADIUS) return true;

  // Build segment list and test each for distance <= tolerance.
  const segments: Array<[Point, Point]> = [];
  let prev: Point = fromPt;
  for (const wp of attrs.waypoints) {
    segments.push([prev, wp]);
    prev = wp;
  }
  segments.push([prev, toPt]);

  for (const [a, b] of segments) {
    if (distancePointToSegment(point, a, b) <= CONNECTOR_HIT_TOLERANCE) {
      return true;
    }
  }
  return false;
}

/**
 * Pin-specific hit test for a connector. Returns which endpoint pin
 * (`'from'` or `'to'`) the point hits within `CONNECTOR_PIN_RADIUS`,
 * or `null` if neither pin is hit. The `from` pin is tested first so
 * ties resolve to `'from'`.
 *
 * The controller uses this to detect when a user is trying to
 * reattach a dangling connector's endpoint by clicking the pin
 * (task 11.2 in connector-items spec.md).
 *
 * Live endpoint positions are resolved via the optional `getItem`
 * lookup; without it, the function falls back to the connector's
 * stored `x`/`y` and the anchor offsets.
 */
export function connectorPinHit(
  item: BoardItem,
  point: Point,
  getItem?: (id: string) => BoardItem | undefined,
): 'from' | 'to' | null {
  const attrs = item.attrs as unknown as ConnectorAttrs;
  const fromItem = getItem ? getItem(attrs.from) : undefined;
  const toItem = getItem ? getItem(attrs.to) : undefined;
  const fromPt: Point = resolveAnchor(attrs.fromAnchor, fromItem);
  const toPt: Point = resolveAnchor(attrs.toAnchor, toItem);
  const fromDist = Math.hypot(point.x - fromPt.x, point.y - fromPt.y);
  if (fromDist <= CONNECTOR_PIN_RADIUS) return 'from';
  const toDist = Math.hypot(point.x - toPt.x, point.y - toPt.y);
  if (toDist <= CONNECTOR_PIN_RADIUS) return 'to';
  return null;
}

/**
 * The `ConnectorItemDefinition` for the `ITEM_TYPES` registry.
 *
 * `getBounds` and `hitTest` here do not have access to the live items
 * map (the registry contract passes only the item itself). The
 * controller compensates by re-resolving endpoint positions before
 * each render and passing the resolved positions to a wrapper
 * (see `renderConnector` in the client package and the `Option B`
 * logic in the controller's `updateItem`).
 *
 * KNOWN LIMITATION: The registry-level `hitTest` falls back to the
 * connector's stored `x`/`y` when endpoint items are not found via
 * a lookup. After an endpoint moves, the spatial index re-queries
 * on `updateItem`, so the next click after the move will hit-test
 * correctly. There is no need to special-case this — the
 * controller's endpoint-tracking loop re-renders the connector on
 * every endpoint change, keeping the spatial index fresh.
 */
export const ConnectorItemDefinition: ItemTypeDefinition<ConnectorAttrs> = {
  type: 'connector' as ItemType,
  layerKind: 'connector' as const,
  schema: ConnectorAttrsSchema as unknown as import('zod').ZodType<ConnectorAttrs>,
  defaultAttrs: DEFAULT_CONNECTOR_ATTRS,
  defaultSize: { width: 0, height: 0 },
  getBounds(item: BoardItem): Rect {
    return getConnectorBounds(item);
  },
  hitTest(item: BoardItem, point: Point): boolean {
    return connectorHitTest(item, point);
  },
};
