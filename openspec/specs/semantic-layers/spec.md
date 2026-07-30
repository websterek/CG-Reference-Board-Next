# semantic-layers

## Purpose

Semantic layer kinds are defined through the `LayerDefinition` registry (see the `layer-registry` capability). The registry is the single source of truth for which kinds exist, their z-order, hit-priority, snap policy, overlap rules, and containment policy. Items are auto-routed by `ItemTypeDefinition.layerKind` so users never choose a layer. Boards are pre-populated with the four default kinds (`frame`, `media`, `overlay`, `annotation`) but additional kinds can be registered at runtime. Legacy single-layer boards migrate to the four default kinds on first load.

---

<!-- Promoted from openspec/changes/grid-native-items-and-typed-layers/specs/semantic-layers/spec.md -->

## Requirements

### Requirement: Registry-driven kinds
The system SHALL define layer kinds through the `LayerDefinition` registry rather than a hardcoded closed union. The registry SHALL be the single source of truth for which kinds exist, their z-order, hit-priority, snap policy, overlap rules, and containment policy. The four default kinds (`frame`, `media`, `overlay`, `annotation`) SHALL be pre-populated at module load with the policy values from the council decision table.

#### Scenario: Kinds come from registry
- **WHEN** the system needs to know which layer kinds exist
- **THEN** it queries the `LayerDefinition` registry
- **THEN** no hardcoded layer-kind union is referenced outside the registry

#### Scenario: Default kinds are pre-populated
- **WHEN** the registry module is loaded
- **THEN** it contains exactly four entries: `frame`, `media`, `overlay`, `annotation`
- **THEN** the entries carry the policy values defined in the council decision table

#### Scenario: Adding a kind is one registration
- **WHEN** a developer adds a new layer kind
- **THEN** they register one `LayerDefinition` entry via `addLayer()`
- **THEN** all derived lists (z-order, hit-priority, schema validation, visibility) update automatically
- **THEN** no changes are needed in `board.ts`, `controller.ts`, or `LayerSchema`

### Requirement: Backward compatibility
The system SHALL ensure that existing boards with 4-kind data continue to work after the migration to the registry model. Layer IDs (`frames`, `media`, `overlay`, `annotations`) and layer kinds (`frame`, `media`, `overlay`, `annotation`) SHALL be preserved exactly so persisted data validates unchanged.

#### Scenario: Existing board loads after migration
- **WHEN** a board created before the registry refactor is opened
- **THEN** the board's 4 layers map to the 4 default registry entries
- **THEN** all items retain their layer assignments
- **THEN** z-order, hit-testing, and overlap rules behave identically to before the refactor

#### Scenario: Layer IDs are unchanged
- **WHEN** an existing board is loaded after migration
- **THEN** the layer IDs (`frames`, `media`, `overlay`, `annotations`) are unchanged
- **THEN** `BoardItemSchema` validation accepts these layer IDs

#### Scenario: Visibility and lock state preserved
- **WHEN** an existing board has custom visibility or lock state on a layer
- **THEN** that state is preserved after migration
- **THEN** the registry's `defaultVisible` and `defaultLocked` do not overwrite persisted state

### Requirement: Kind promotion path
The system SHALL provide a clear, low-friction path for promoting a new layer kind from concept to production. Adding a new kind SHALL be a single registry entry, not a breaking change spanning multiple files.

#### Scenario: New kind requires one file change
- **WHEN** a developer adds a new layer kind (e.g., `connector`)
- **THEN** they create one `LayerDefinition` entry and call `addLayer()`
- **THEN** no changes are needed in `board.ts`, `controller.ts`, `LayerSchema`, or `BoardItemSchema`

#### Scenario: New kind integrates with existing tooling
- **WHEN** a new layer kind is registered
- **THEN** `sortByZOrder()` includes it in the correct position
- **THEN** `sortByHitPriority()` includes it in the correct position
- **THEN** `initLayerVisibility()` includes it with the registry default
- **THEN** `BoardItemSchema` accepts its layer ID

### Requirement: Default z-order and rendering
The four default kinds SHALL render back to front in this order: `frame` (z=0) behind `media` (z=1) behind `overlay` (z=2) behind `annotation` (z=4). The gap at z=3 leaves room for future kinds (e.g. connector). `sortByZOrder()` SHALL return this order.

#### Scenario: Items render in correct z-order
- **WHEN** items exist on multiple layer kinds
- **THEN** `frame` items render behind `media` items
- **THEN** `media` items render behind `overlay` items
- **THEN** `overlay` items render behind `annotation` items

### Requirement: Auto-routing by item type
Each `ItemTypeDefinition` SHALL declare a `layerKind`. When a new item is created, its `layerId` SHALL be the layer whose kind matches the item type's `layerKind`. The user SHALL NOT manually choose a layer for an item.

#### Scenario: Rectangle item is created on the media layer
- **WHEN** user creates a rectangle item via the Rectangle tool
- **THEN** the item is added to the layer with kind `media`
- **THEN** no UI prompt asks the user to pick a layer

#### Scenario: Frame item is created on the frame layer
- **WHEN** user creates a frame item via the Frame tool
- **THEN** the item is added to the layer with kind `frame`
- **THEN** no UI prompt asks the user to pick a layer

#### Scenario: Annotation stroke is created on the annotation layer
- **WHEN** user draws a freehand stroke in Annotation Mode
- **THEN** the stroke is added to the layer with kind `annotation`
- **THEN** no UI prompt asks the user to pick a layer

### Requirement: Layer visibility controls
The system SHALL persist each layer's `visible` and `locked` flags. Hidden layers SHALL NOT render their items but SHALL retain them in the data model. Locked layers SHALL NOT accept input.

#### Scenario: Hidden layer is not rendered
- **WHEN** user toggles a layer to hidden
- **THEN** items on that layer are not drawn
- **THEN** the items remain in the data model and reappear when the layer is unhidden

#### Scenario: Locked layer rejects input
- **WHEN** user clicks an item on a locked layer
- **THEN** the item is not selected
- **THEN** no drag or resize can start on items in the locked layer

### Requirement: Legacy single-layer boards migrate to four default kinds
On first load, the system SHALL detect legacy boards (single layer with id `default` and name `Layer 1`) and migrate them atomically: insert the four default kinds in correct z-order, reassign all existing items to the `media` layer, and remove the legacy layer.

#### Scenario: Legacy board migration
- **WHEN** a board created before this change is opened
- **THEN** the Yjs document is migrated in a single transaction
- **THEN** four layers exist after migration
- **THEN** all existing items are reassigned to the `media` layer
- **THEN** the legacy `default` layer is removed
- **THEN** remote peers see the migration as one consistent change

### Requirement: Annotation layer exempt from snap
Items on the `annotation` layer SHALL store raw board coordinates without cell quantization. The `GridService.snapRect` function called for annotation creation MUST operate with `snapEnabled: false`. Annotation strokes SHALL NOT participate in the non-overlap invariant.

#### Scenario: Annotation strokes are not quantized
- **WHEN** user draws a freehand stroke
- **THEN** the stroke's vertices are stored at raw board coordinates
- **THEN** vertices are not snapped to cell boundaries

#### Scenario: Annotation strokes do not trigger overlap rejection
- **WHEN** two annotation strokes overlap
- **THEN** both strokes persist without rejection
- **THEN** neither stroke returns to a previous position

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

### Requirement: Non-empty deletion forbidden
The system SHALL forbid deletion of a layer that contains items and SHALL forbid deletion of the four default kinds.

#### Scenario: Default kinds are immutable
- **WHEN** `deleteLayer('frame')` (or any default kind) is called
- **THEN** an error is thrown
- **THEN** the entry remains in the registry

#### Scenario: Non-empty custom layer cannot be deleted
- **WHEN** `deleteLayer('custom-kind', 5)` is called
- **THEN** an error is thrown indicating the layer has items
- **THEN** the entry remains in the registry
