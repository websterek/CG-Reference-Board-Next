# layer-registry

## Purpose

Extensible `LayerDefinition` registry that replaces the closed `LayerKind` union. The registry defines per-kind policies (z-order, snap, overlap, containment, hit-priority) and derives all hardcoded lists from registry entries. Boards can add layers at runtime; non-empty layers cannot be deleted.

---

## Requirements

### Requirement: LayerDefinition Interface

The system SHALL define a `LayerDefinition` interface with 10 fields describing a layer kind's policies and metadata.

#### Scenario: Interface shape

- **WHEN** a developer inspects the `LayerDefinition` type
- **THEN** it has fields: `kind` (string), `displayName` (string), `zOrder` (number), `snapPolicy` (`'mandatory' | 'off'`), `overlapRule` (`'forbid-same-kind' | 'none' | ((proposed, existing) => boolean)`), `containmentPolicy` (`'none' | 'no-nesting'`), `hitPriority` (number), `canBeConnectorEndpoint` (boolean), `defaultVisible` (boolean), `defaultLocked` (boolean)

#### Scenario: Kind is extensible string

- **WHEN** a new layer kind is registered
- **THEN** the `kind` field accepts any string value
- **THEN** no TypeScript union type needs to be modified

#### Scenario: Overlap rule supports custom functions

- **WHEN** a layer kind needs a custom overlap policy beyond `'forbid-same-kind'` or `'none'`
- **THEN** the `overlapRule` field accepts a function `(proposed: Rect, existing: Rect) => boolean`
- **THEN** the function receives the proposed item bounds and an existing item's bounds and returns whether overlap is allowed

---

### Requirement: Default Registry Population

The system SHALL populate the registry with 4 default entries matching the existing layer kinds: `frame`, `media`, `overlay`, `annotation`.

#### Scenario: Four default entries exist

- **WHEN** the registry module is loaded
- **THEN** exactly 4 entries are registered: `frame`, `media`, `overlay`, `annotation`
- **THEN** each entry has the policy values defined in the council decision table

#### Scenario: Frame entry policy values

- **WHEN** the `frame` entry is inspected
- **THEN** `zOrder` is 0, `snapPolicy` is `'mandatory'`, `overlapRule` is `'forbid-same-kind'`, `containmentPolicy` is `'no-nesting'`, `canBeConnectorEndpoint` is `false`, `hitPriority` is 10

#### Scenario: Media entry policy values

- **WHEN** the `media` entry is inspected
- **THEN** `zOrder` is 1, `snapPolicy` is `'mandatory'`, `overlapRule` is `'forbid-same-kind'`, `containmentPolicy` is `'none'`, `canBeConnectorEndpoint` is `true`, `hitPriority` is 20

#### Scenario: Overlay entry policy values

- **WHEN** the `overlay` entry is inspected
- **THEN** `zOrder` is 2, `snapPolicy` is `'mandatory'`, `overlapRule` is `'forbid-same-kind'`, `containmentPolicy` is `'none'`, `canBeConnectorEndpoint` is `true`, `hitPriority` is 30

#### Scenario: Annotation entry policy values

- **WHEN** the `annotation` entry is inspected
- **THEN** `zOrder` is 4, `snapPolicy` is `'off'`, `overlapRule` is `'none'`, `containmentPolicy` is `'none'`, `canBeConnectorEndpoint` is `false`, `hitPriority` is 50

---

### Requirement: Z-Order Derivation

The system SHALL derive the layer z-order list from the registry by sorting entries by `zOrder` ascending.

#### Scenario: Z-order list matches registry sort

- **WHEN** `sortByZOrder()` is called
- **THEN** it returns layer kinds in ascending `zOrder` order: `['frame', 'media', 'overlay', 'annotation']`
- **THEN** the result replaces the hardcoded `LAYER_Z_ORDER` array at `controller.ts:60`

#### Scenario: New kind with intermediate z-order

- **WHEN** a new kind is registered with `zOrder: 3`
- **THEN** `sortByZOrder()` returns `['frame', 'media', 'overlay', <new-kind>, 'annotation']`
- **THEN** no code change is needed in the controller to respect the new z-order

---

### Requirement: Hit-Priority Derivation

The system SHALL derive hit-test priority lists from the registry by sorting entries by `hitPriority` descending.

#### Scenario: Hit-priority list matches registry sort

- **WHEN** `sortByHitPriority()` is called
- **THEN** it returns layer kinds in descending `hitPriority` order: `['annotation', 'overlay', 'media', 'frame']`
- **THEN** the result replaces the hardcoded `layerPriority` arrays at `controller.ts:304` and `controller.ts:1106`

#### Scenario: New kind with high hit-priority

- **WHEN** a new kind is registered with `hitPriority: 60`
- **THEN** `sortByHitPriority()` returns the new kind first, before `annotation`
- **THEN** hit-testing tests the new kind's items before annotation items

---

### Requirement: Schema Derivation

The system SHALL derive the `BoardItemSchema.layerId` allowed values from the registry's layer IDs.

#### Scenario: LayerId refinement uses registry

- **WHEN** `BoardItemSchema` validates a `layerId`
- **THEN** the allowed values are the layer IDs from the registry, not a hardcoded list
- **THEN** the hardcoded refinement at `board.ts:169-173` is replaced with a registry-derived validator

#### Scenario: New kind's layer ID is valid

- **WHEN** a new kind is registered with a layer ID
- **THEN** `BoardItemSchema` accepts that layer ID without schema changes

---

### Requirement: Visibility Initialization

The system SHALL initialize the `layerVisible` map from the registry's `defaultVisible` field.

#### Scenario: Default visibility from registry

- **WHEN** the controller initializes the `layerVisible` map
- **THEN** each registered kind's visibility is set to its `defaultVisible` value
- **THEN** the hardcoded map at `controller.ts:97-102` is replaced with registry-derived initialization

#### Scenario: New kind with defaultVisible: false

- **WHEN** a new kind is registered with `defaultVisible: false`
- **THEN** the `layerVisible` map initializes that kind to `false`
- **THEN** items on that layer are not rendered until the user toggles visibility

---

### Requirement: Runtime Add-Layer

The system SHALL allow boards to append new layer definitions at runtime via `addLayer(def)`.

#### Scenario: Add a new layer kind

- **WHEN** `addLayer({ kind: 'connector', ... })` is called
- **THEN** the registry contains the new entry
- **THEN** `sortByZOrder()` and `sortByHitPriority()` include the new kind
- **THEN** `BoardItemSchema` accepts the new kind's layer ID

#### Scenario: Add duplicate kind is rejected

- **WHEN** `addLayer({ kind: 'frame', ... })` is called and `frame` already exists
- **THEN** an error is thrown
- **THEN** the existing `frame` entry is unchanged

---

### Requirement: Non-Empty Deletion Forbidden

The system SHALL forbid deletion of a layer that contains items.

#### Scenario: Delete empty layer succeeds

- **WHEN** `deleteLayer('custom-kind')` is called and no items exist on that layer
- **THEN** the entry is removed from the registry
- **THEN** `sortByZOrder()` and `sortByHitPriority()` no longer include the deleted kind

#### Scenario: Delete non-empty layer is rejected

- **WHEN** `deleteLayer('media')` is called and items exist on the media layer
- **THEN** an error is thrown with a message indicating the layer has items
- **THEN** the `media` entry remains in the registry

#### Scenario: Delete default kind is rejected

- **WHEN** `deleteLayer('frame')` is called
- **THEN** an error is thrown indicating default kinds cannot be deleted
- **THEN** the `frame` entry remains in the registry

---

### Requirement: Auto-Routing Preserved

The system SHALL preserve the existing auto-routing behavior: `layerKindFor(type)` returns the `layerKind` declared in the item type's `ItemTypeDefinition`.

#### Scenario: Rectangle routes to media

- **WHEN** `layerKindFor('rectangle')` is called
- **THEN** it returns `'media'`
- **THEN** the implementation uses `ITEM_TYPES[type].layerKind` unchanged

#### Scenario: Frame routes to frame

- **WHEN** `layerKindFor('frame')` is called
- **THEN** it returns `'frame'`

#### Scenario: Annotation-stroke routes to annotation

- **WHEN** `layerKindFor('annotation-stroke')` is called
- **THEN** it returns `'annotation'`

---

### Requirement: Cross-Layer Overlap Allowed

The system SHALL allow items on different layer kinds to overlap.

#### Scenario: Media item inside frame

- **WHEN** a media item is placed so its bounds intersect a frame item's bounds
- **THEN** both items persist without rejection
- **THEN** the media item renders on top of the frame item (per z-order)

#### Scenario: Overlay item on top of media item

- **WHEN** an overlay item is placed so its bounds intersect a media item's bounds
- **THEN** both items persist without rejection
- **THEN** the overlay item renders on top of the media item (per z-order)

---

### Requirement: Same-Kind Non-Overlap Preserved

The system SHALL enforce that items on the same layer kind cannot overlap when the kind's `overlapRule` is `'forbid-same-kind'`.

#### Scenario: Two media items cannot overlap

- **WHEN** a media item is dragged so its bounds intersect another media item's bounds
- **THEN** the dragged item is rejected and returns to its last valid position
- **THEN** both media items remain non-overlapping

#### Scenario: Two frame items cannot overlap

- **WHEN** a frame item is resized so its bounds intersect another frame item's bounds
- **THEN** the resize is rejected and the frame returns to its last valid bounds

#### Scenario: Annotation strokes can overlap

- **WHEN** two annotation strokes overlap
- **THEN** both strokes persist without rejection
- **THEN** the `annotation` kind's `overlapRule: 'none'` is respected

---

### Requirement: Containment Policy

The system SHALL enforce containment policies defined in the registry.

#### Scenario: Frame kind forbids nesting

- **WHEN** the `frame` kind's `containmentPolicy` is `'no-nesting'`
- **THEN** a frame item cannot be placed entirely inside another frame item
- **THEN** the placement is rejected

#### Scenario: Media kind allows nesting

- **WHEN** the `media` kind's `containmentPolicy` is `'none'`
- **THEN** a media item can be placed inside a frame item
- **THEN** no containment rejection occurs
