# connector-items

## Purpose

First-class graph-edge connectors between board items. Connectors bind to endpoint items by `ItemId` reference, re-route when endpoints move, and support waypoints, routing styles, and arrowheads. When an endpoint item is deleted, the connector becomes dangling (red broken-line indicator) rather than being cascade-deleted.

---

## ADDED Requirements

### Requirement: ConnectorItem Type

The system SHALL define a `ConnectorItem` interface extending `BoardItem` with `type: 'connector'` and `layerKind: 'connector'`. The `from` and `to` fields SHALL be `ItemId` strings referencing endpoint items, NOT embedded positions. The `x`/`y`/`width`/`height` fields SHALL be a derived bounding box of the rendered path, recomputed when endpoints or waypoints change.

```typescript
interface ConnectorAttrs {
  from: ItemId;
  to: ItemId;
  fromAnchor: 'auto' | { x: number; y: number };
  toAnchor: 'auto' | { x: number; y: number };
  waypoints: Point[];
  routing: 'straight' | 'orthogonal' | 'curved';
  style: {
    strokeColor: string;
    strokeWidth: number;
    arrowheadStart: 'none' | 'arrow';
    arrowheadEnd: 'none' | 'arrow';
  };
  dangling: boolean;
}

interface ConnectorItem extends BoardItem {
  type: 'connector';
  layerKind: 'connector';
  attrs: ConnectorAttrs;
}
```

#### Scenario: ConnectorItem has ItemId endpoint refs

- **WHEN** a connector is created between two items
- **THEN** `attrs.from` and `attrs.to` are `ItemId` strings
- **THEN** the connector does not store endpoint positions directly
- **THEN** endpoint positions are resolved at render time from the referenced items

#### Scenario: ConnectorItem has derived bounding box

- **WHEN** a connector's path is computed from endpoints and waypoints
- **THEN** `x`/`y`/`width`/`height` are set to the bounding box of the rendered path
- **THEN** the bounding box is recomputed when endpoints move or waypoints change
- **THEN** the bounding box is used for spatial indexing and viewport culling, not as authoritative geometry

#### Scenario: ConnectorItem has default style

- **WHEN** a connector is created without explicit style
- **THEN** `attrs.style.strokeColor` defaults to `'#ffffff'`
- **THEN** `attrs.style.strokeWidth` defaults to `2`
- **THEN** `attrs.style.arrowheadStart` defaults to `'none'`
- **THEN** `attrs.style.arrowheadEnd` defaults to `'arrow'`

#### Scenario: ConnectorItem has default routing

- **WHEN** a connector is created without explicit routing
- **THEN** `attrs.routing` defaults to `'straight'`
- **THEN** `attrs.waypoints` defaults to `[]`
- **THEN** `attrs.fromAnchor` defaults to `'auto'`
- **THEN** `attrs.toAnchor` defaults to `'auto'`
- **THEN** `attrs.dangling` defaults to `false`

---

### Requirement: Layer Kind

The system SHALL define `connector` as a first-class layer kind with the following policies:

| Policy | Value | Rationale |
|---|---|---|
| `zOrder` | 3 | Between overlay (2) and annotation (4) |
| `snapPolicy` | `'off'` | Connectors don't snap to grid |
| `overlapRule` | `'none'` | Connectors can cross freely |
| `containmentPolicy` | `'none'` | No containment restrictions |
| `hitPriority` | 40 | Between overlay (30) and annotation (50) |
| `canBeConnectorEndpoint` | `false` | Connectors don't connect to other connectors in v1 |
| `defaultVisible` | `true` | Visible by default |
| `defaultLocked` | `false` | Unlocked by default |

#### Scenario: Connector kind is registered in the layer registry

- **WHEN** the layer registry is initialized
- **THEN** a `connector` entry exists with `zOrder: 3`
- **THEN** the entry has `snapPolicy: 'off'`
- **THEN** the entry has `overlapRule: 'none'`
- **THEN** the entry has `hitPriority: 40`

#### Scenario: Connector kind appears in derived lists

- **WHEN** `sortByZOrder()` is called
- **THEN** the result includes `'connector'` between `'overlay'` and `'annotation'`
- **WHEN** `sortByHitPriority()` is called
- **THEN** the result includes `'connector'` between `'overlay'` and `'annotation'`

#### Scenario: Connector kind is not a connector endpoint

- **WHEN** a user attempts to start or end a connector on another connector
- **THEN** the connector item is not a valid endpoint target
- **THEN** the `canBeConnectorEndpoint: false` policy is enforced by the tool

---

### Requirement: Z-Order

The system SHALL render connector items above overlay items and below annotation items. The full z-order from back to front SHALL be `frame (0) < media (1) < overlay (2) < connector (3) < annotation (4)`.

#### Scenario: Connectors render above overlay items

- **WHEN** a connector and an overlay item overlap visually
- **THEN** the connector is drawn on top of the overlay item

#### Scenario: Connectors render below annotation strokes

- **WHEN** a connector and an annotation stroke overlap visually
- **THEN** the annotation stroke is drawn on top of the connector

#### Scenario: Connector z-order is preserved across reload

- **WHEN** a board with connectors, overlay items, and annotation strokes is saved and reloaded
- **THEN** the z-order `overlay < connector < annotation` is preserved

---

### Requirement: Endpoint Integrity

When an endpoint item is deleted, the system SHALL set `attrs.dangling: true` on all connectors referencing that item. The connector SHALL NOT be cascade-deleted. The user SHALL be able to reattach or delete the dangling connector.

#### Scenario: Dangling flag set on source endpoint delete

- **WHEN** the item referenced by `attrs.from` is deleted
- **THEN** the connector's `attrs.dangling` is set to `true`
- **THEN** the connector is NOT removed from the board
- **THEN** the connector's `attrs.from` reference is preserved (not nulled)

#### Scenario: Dangling flag set on target endpoint delete

- **WHEN** the item referenced by `attrs.to` is deleted
- **THEN** the connector's `attrs.dangling` is set to `true`
- **THEN** the connector is NOT removed from the board
- **THEN** the connector's `attrs.to` reference is preserved (not nulled)

#### Scenario: Dangling flag set when both endpoints deleted

- **WHEN** both endpoint items of a connector are deleted
- **THEN** the connector's `attrs.dangling` is set to `true`
- **THEN** the connector remains on the board with both references preserved

#### Scenario: Dangling flag cleared on reattach

- **WHEN** a dangling connector's endpoint is reattached to an existing item
- **THEN** `attrs.dangling` is set to `false`
- **THEN** the connector renders with its normal style

---

### Requirement: Dangling Marker

When `attrs.dangling` is `true`, the system SHALL render the connector with a red broken-line indicator. The broken line SHALL use a dashed stroke pattern in red (`#ff0000`) to visually distinguish dangling connectors from active ones.

#### Scenario: Dangling connector renders with red broken line

- **WHEN** a connector has `attrs.dangling: true`
- **THEN** the connector path is rendered with a dashed stroke pattern
- **THEN** the stroke color is red (`#ff0000`)
- **THEN** the broken-line pattern is visually distinct from the normal solid stroke

#### Scenario: Active connector renders with normal style

- **WHEN** a connector has `attrs.dangling: false`
- **THEN** the connector path is rendered with a solid stroke
- **THEN** the stroke color is `attrs.style.strokeColor`
- **THEN** no red or dashed styling is applied

#### Scenario: Dangling marker updates on endpoint delete

- **WHEN** an endpoint item is deleted while the board is open
- **THEN** the connector immediately transitions to the red broken-line style
- **THEN** the transition is visible to all collaborators

---

### Requirement: Hit Testing

The system SHALL hit-test connectors by distance-to-segment: a point is considered a hit if it is within 8px (in board coordinates) of any segment of the connector's rendered path. Endpoint pins (small circles at the `from` and `to` positions) SHALL hit at higher priority than the path segments.

#### Scenario: Hit on path segment within 8px

- **WHEN** the user clicks within 8px of a connector's path segment
- **THEN** the connector is hit and selected
- **THEN** the hit is registered regardless of which segment (straight line, waypoint segment, or curve) is nearest

#### Scenario: No hit beyond 8px tolerance

- **WHEN** the user clicks more than 8px away from all segments of a connector's path
- **THEN** the connector is not hit
- **THEN** hit testing falls through to items on lower layers

#### Scenario: Endpoint pin hit at higher priority

- **WHEN** the user clicks on an endpoint pin (within 8px of the `from` or `to` position)
- **THEN** the endpoint pin hit is registered before path segment hits
- **THEN** the connector is selected

#### Scenario: Hit test uses spatial index for candidates

- **WHEN** hit testing is performed
- **THEN** only connectors whose bounding box contains the point are tested for distance-to-segment
- **THEN** connectors outside the point's spatial index query are skipped

---

### Requirement: Bounding Box

The `x`/`y`/`width`/`height` fields of a `ConnectorItem` SHALL be the derived bounding box of the rendered path — the union of all path points (endpoint anchor positions plus waypoints) with padding for stroke width and arrowheads. These fields SHALL NOT be authoritative geometry; they are used for spatial indexing and viewport culling only.

#### Scenario: Bounding box is derived from path

- **WHEN** a connector's path is computed from endpoints and waypoints
- **THEN** `x` is the minimum x of all path points minus padding
- **THEN** `y` is the minimum y of all path points minus padding
- **THEN** `width` is `maxX - minX + 2 * padding`
- **THEN** `height` is `maxY - minY + 2 * padding`

#### Scenario: Bounding box updates when endpoints move

- **WHEN** an endpoint item is moved
- **THEN** the connector's bounding box is recomputed
- **THEN** the spatial index is updated with the new bounding box

#### Scenario: Bounding box is not authoritative

- **WHEN** the connector is rendered
- **THEN** the path is computed from `attrs.from`/`attrs.to` endpoint positions and `attrs.waypoints`
- **THEN** the `x`/`y`/`width`/`height` fields are NOT used to position or size the rendered path

---

### Requirement: Waypoint Model

The system SHALL support optional waypoints (`attrs.waypoints: Point[]`) for manual path bends. When `waypoints` is empty, the connector SHALL render as a straight line between the computed anchor points. When `waypoints` is non-empty, the path SHALL pass through each waypoint in order from `from` anchor → waypoints[0] → ... → waypoints[n] → `to` anchor.

#### Scenario: Straight line when no waypoints

- **WHEN** a connector has `attrs.waypoints: []`
- **THEN** the rendered path is a straight line from the `from` anchor to the `to` anchor
- **THEN** the path has no intermediate bends

#### Scenario: Path passes through waypoints

- **WHEN** a connector has `attrs.waypoints: [w1, w2]`
- **THEN** the rendered path goes `from anchor → w1 → w2 → to anchor`
- **THEN** each waypoint is a board-coordinate point snapped to the grid

#### Scenario: Waypoints are optional

- **WHEN** a connector is created via the two-click tool
- **THEN** `attrs.waypoints` is initialized as `[]`
- **THEN** the connector renders as a straight line

---

### Requirement: Anchor Resolution

The `fromAnchor` and `toAnchor` fields SHALL accept either `'auto'` or an explicit `{ x: number; y: number }` relative to the endpoint item's bounds. When `'auto'`, the anchor SHALL resolve to the item's center at render time. When explicit, the anchor SHALL be interpreted as an offset from the item's top-left corner.

#### Scenario: Auto anchor resolves to item center

- **WHEN** a connector has `fromAnchor: 'auto'` and the source item is at `(100, 200)` with size `(80, 60)`
- **THEN** the `from` anchor position resolves to `(140, 230)` at render time
- **THEN** the anchor updates when the source item moves

#### Scenario: Explicit anchor is relative to item bounds

- **WHEN** a connector has `fromAnchor: { x: 0.5, y: 0 }` and the source item is at `(100, 200)` with size `(80, 60)`
- **THEN** the `from` anchor position resolves to `(140, 200)` at render time
- **THEN** the anchor updates when the source item moves

#### Scenario: Anchor resolution handles missing endpoint

- **WHEN** a connector's endpoint item has been deleted (dangling)
- **THEN** the anchor position resolves to the item's last known position
- **THEN** the connector still renders (with the dangling marker) rather than disappearing

---

### Requirement: Routing Styles

The system SHALL support three routing styles: `'straight'` (direct line between anchors), `'orthogonal'` (axis-aligned path with 90° bends), and `'curved'` (cubic bezier curve between anchors). The routing style SHALL be stored in `attrs.routing`.

#### Scenario: Straight routing

- **WHEN** a connector has `attrs.routing: 'straight'`
- **THEN** the rendered path is a single straight line segment from the `from` anchor to the `to` anchor
- **THEN** waypoints, if present, are connected by straight line segments

#### Scenario: Orthogonal routing

- **WHEN** a connector has `attrs.routing: 'orthogonal'`
- **THEN** the rendered path consists of horizontal and vertical segments only
- **THEN** bends are at 90° angles
- **THEN** the path is computed from anchor positions and waypoints using an orthogonal routing algorithm

#### Scenario: Curved routing

- **WHEN** a connector has `attrs.routing: 'curved'`
- **THEN** the rendered path is a cubic bezier curve from the `from` anchor to the `to` anchor
- **THEN** the curve control points are computed from the anchor positions and waypoints

---

### Requirement: Arrowhead Configuration

The system SHALL support arrowheads at the start and/or end of a connector. Each arrowhead SHALL be independently configurable as `'none'` or `'arrow'` via `attrs.style.arrowheadStart` and `attrs.style.arrowheadEnd`.

#### Scenario: Arrowhead at end only

- **WHEN** a connector has `arrowheadStart: 'none'` and `arrowheadEnd: 'arrow'`
- **THEN** an arrowhead triangle is rendered at the `to` anchor position
- **THEN** no arrowhead is rendered at the `from` anchor position
- **THEN** the arrowhead points in the direction of the last path segment

#### Scenario: Arrowheads at both ends

- **WHEN** a connector has `arrowheadStart: 'arrow'` and `arrowheadEnd: 'arrow'`
- **THEN** arrowhead triangles are rendered at both the `from` and `to` anchor positions
- **THEN** each arrowhead points along its respective path segment direction

#### Scenario: No arrowheads

- **WHEN** a connector has `arrowheadStart: 'none'` and `arrowheadEnd: 'none'`
- **THEN** no arrowhead triangles are rendered
- **THEN** the path terminates at the anchor positions without decoration

---

### Requirement: Two-Click Tool

The system SHALL provide a `ConnectorTool` with two-click interaction: the user clicks the first endpoint item, drags (showing a preview line), then clicks the second endpoint item to create the connector. Pressing Esc during creation SHALL cancel the operation.

#### Scenario: Two-click creation flow

- **WHEN** the ConnectorTool is active and the user clicks on an item
- **THEN** that item becomes the `from` endpoint
- **THEN** a preview line follows the pointer from the source anchor
- **WHEN** the user clicks on a second item
- **THEN** a `ConnectorItem` is created with `from` = first item ID and `to` = second item ID
- **THEN** the connector is added to the `connector` layer

#### Scenario: Esc cancels mid-creation

- **WHEN** the user has clicked the first endpoint and a preview line is visible
- **WHEN** the user presses Esc
- **THEN** the preview line is removed
- **THEN** no connector is created
- **THEN** the tool resets to waiting for the first click

#### Scenario: Click on non-item during creation

- **WHEN** the ConnectorTool is active and the user clicks on empty canvas space
- **THEN** if no first endpoint is selected, nothing happens
- **THEN** if a first endpoint is selected, the click is ignored (must click an item to complete)

#### Scenario: Click on same item for both endpoints

- **WHEN** the user clicks the same item for both `from` and `to`
- **THEN** the connector is NOT created (self-loops are not supported in v1)
- **THEN** the tool resets to waiting for the first click

---

### Requirement: Endpoint Tracking

The system SHALL re-resolve connector endpoint positions each frame from the live positions of the referenced items. When an endpoint item moves (via drag, remote update, or keyboard nudge), the connector SHALL re-render its path to follow the new endpoint position.

#### Scenario: Connector follows source item on drag

- **WHEN** the user drags an item that is the `from` endpoint of a connector
- **THEN** the connector's path updates on every frame to follow the moving item
- **THEN** the connector's bounding box is recomputed
- **THEN** the spatial index is updated

#### Scenario: Connector follows target item on remote update

- **WHEN** a remote collaborator moves an item that is the `to` endpoint of a connector
- **THEN** the connector's path updates to follow the new position
- **THEN** the update is visible to all collaborators

#### Scenario: Connector follows both endpoints simultaneously

- **WHEN** both endpoint items of a connector are moved (e.g., multi-select drag)
- **THEN** the connector's path updates to follow both new positions
- **THEN** the path correctly connects the two new anchor positions

#### Scenario: Endpoint tracking uses ItemId refs, not stale positions

- **WHEN** a connector's endpoint item is moved by a remote collaborator between render frames
- **THEN** the connector resolves the endpoint position from the item's current `x`/`y`/`width`/`height`
- **THEN** the connector does NOT use a cached or stale position
- **THEN** the `ItemId` reference ensures the connector always follows the correct item, even under concurrent edits
