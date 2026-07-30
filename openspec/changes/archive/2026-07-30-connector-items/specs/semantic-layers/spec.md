# semantic-layers (delta)

## Purpose

This delta adds the `connector` layer kind to the `semantic-layers` capability. It is a delta on top of the `layer-registry` proposal's registry-driven model — the `connector` kind is registered as a `LayerDefinition` entry in the registry, and all derived lists (z-order, hit-priority, visibility, schema validation) update automatically.

---

## MODIFIED Requirements

### Requirement: Connector Kind Registration

The system SHALL register `connector` as a first-class layer kind in the `LayerDefinition` registry with `zOrder: 3`, placing it between `overlay` (z=2) and `annotation` (z=4). The connector kind SHALL have the following policies:

| Policy | Value |
|---|---|
| `kind` | `'connector'` |
| `displayName` | `'Connectors'` |
| `zOrder` | 3 |
| `snapPolicy` | `'off'` |
| `overlapRule` | `'none'` |
| `containmentPolicy` | `'none'` |
| `hitPriority` | 40 |
| `canBeConnectorEndpoint` | `false` |
| `defaultVisible` | `true` |
| `defaultLocked` | `false` |

#### Scenario: Connector kind appears in z-order between overlay and annotation

- **WHEN** `sortByZOrder()` is called after the connector kind is registered
- **THEN** the result is `['frame', 'media', 'overlay', 'connector', 'annotation']`
- **THEN** `connector` appears at index 3, between `overlay` (index 2) and `annotation` (index 4)

#### Scenario: Connector kind appears in hit-priority between overlay and annotation

- **WHEN** `sortByHitPriority()` is called after the connector kind is registered
- **THEN** the result is `['annotation', 'connector', 'overlay', 'media', 'frame']`
- **THEN** `connector` appears at index 1, between `annotation` (index 0) and `overlay` (index 2)

#### Scenario: Connector kind is visible by default

- **WHEN** `initLayerVisibility()` is called after the connector kind is registered
- **THEN** the map contains `'connector' → true`
- **THEN** connector items are visible on new boards

---

### Requirement: Connector Non-Participation in Non-Overlap

Connector items SHALL NOT participate in the same-layer non-overlap invariant. The `overlapRule: 'none'` policy on the connector kind SHALL cause `GridService.canPlace` to skip overlap checks for connectors. Connectors SHALL be exempt from placement-time ghost preview rejection.

#### Scenario: Connectors skip canPlace overlap check

- **WHEN** `GridService.canPlace` is called with a connector item's bounds
- **THEN** the `overlapRule: 'none'` policy causes the overlap check to be skipped
- **THEN** `canPlace` returns `true` regardless of other items' positions

#### Scenario: Connectors do not trigger ghost preview rejection

- **WHEN** a connector is being created or moved
- **THEN** the placement-time ghost preview does not show a red marker for overlap
- **THEN** the connector can be placed anywhere without rejection

#### Scenario: Connectors do not block other items' placement

- **WHEN** a media item is being placed at a position that overlaps a connector
- **THEN** the connector's presence does not cause a rejection for the media item
- **THEN** cross-layer overlap between media and connector is allowed
