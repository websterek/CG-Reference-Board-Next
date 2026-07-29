# semantic-layers

## ADDED Requirements

### Requirement: Four fixed semantic layer kinds
The system SHALL define four fixed `LayerKind` values: `frame`, `media`, `overlay`, `annotation`. Each board SHALL contain exactly one layer of each kind. Layer z-order from back to front SHALL be `frame < media < overlay < annotation`.

#### Scenario: Board has four fixed layers
- **WHEN** a board is created or first loaded
- **THEN** it contains exactly four layers
- **THEN** the layers are named and ordered: `frames`, `media`, `overlay`, `annotations` (back to front)

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

### Requirement: Legacy single-layer boards migrate to four fixed kinds
On first load, the system SHALL detect legacy boards (single layer with id `default` and name `Layer 1`) and migrate them atomically: insert four fixed layers in correct z-order, reassign all existing items to the `media` layer, and remove the legacy layer.

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
