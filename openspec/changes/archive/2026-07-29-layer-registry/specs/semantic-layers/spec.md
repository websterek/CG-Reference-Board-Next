# semantic-layers

## Delta

This change modifies the `semantic-layers` capability to replace the "four fixed kinds forever" model with a registry-driven model. The `LayerDefinition` registry (defined in the `layer-registry` capability) becomes the source of truth for layer kinds, policies, and derived lists.

---

## MODIFIED Requirements

### Requirement: Registry-Driven Kinds

The system SHALL define layer kinds through the `LayerDefinition` registry rather than a hardcoded `LayerKind` union. The registry SHALL be the single source of truth for which kinds exist, their z-order, hit-priority, snap policy, overlap rules, and containment policy.

#### Scenario: Kinds come from registry

- **WHEN** the system needs to know which layer kinds exist
- **THEN** it queries the `LayerDefinition` registry
- **THEN** no hardcoded `LayerKind` union is referenced

#### Scenario: Adding a kind is one registration

- **WHEN** a developer adds a new layer kind
- **THEN** they register one `LayerDefinition` entry in the registry
- **THEN** all derived lists (z-order, hit-priority, schema validation, visibility) update automatically
- **THEN** no changes are needed in `board.ts`, `controller.ts`, or `LayerSchema`

#### Scenario: Policy values come from registry

- **WHEN** the system needs a layer kind's snap policy, overlap rule, or containment policy
- **THEN** it reads the value from the registry entry for that kind
- **THEN** no hardcoded per-kind conditionals exist outside the registry

---

### Requirement: Backward Compatibility

The system SHALL ensure that existing boards with 4-kind data continue to work after migration to the registry model.

#### Scenario: Existing board loads after migration

- **WHEN** a board created before the registry refactor is opened
- **THEN** the board's 4 layers (frames, media, overlay, annotations) map to the 4 default registry entries
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

---

### Requirement: Kind Promotion Path

The system SHALL provide a clear, low-friction path for promoting a new layer kind from concept to production. Adding a new kind SHALL be a single registry entry, not a breaking change spanning multiple files.

#### Scenario: New kind requires one file change

- **WHEN** a developer adds a new layer kind (e.g., `connector`)
- **THEN** they create one `LayerDefinition` entry and call `addLayer()`
- **THEN** no changes are needed in `board.ts`, `controller.ts`, `LayerSchema`, or `BoardItemSchema`

#### Scenario: New kind integrates with existing tooling

- **WHEN** a new layer kind is registered
- **THEN** `sortByZOrder()` includes it in the correct position
- **THEN** `sortByHitPriority()` includes it in the correct position
- **THEN** `layerVisible` initializes it from `defaultVisible`
- **THEN** `BoardItemSchema` accepts its layer ID
