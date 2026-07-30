# board-chrome Specification

## Purpose
TBD - created by archiving change frontend-modularity-phase1-dead-code. Update Purpose after archive.
## Requirements
### Requirement: Single Toolbar Component

The system SHALL ship with exactly one React component that renders the on-canvas toolbar (Select, Move, Hand, plus mode-scoped tools). Other identifiers that previously rendered a duplicate toolbar are removed; the surviving component is the sole source of the toolbar surface.

#### Scenario: One toolbar mounted

- **WHEN** a user opens a board at `/board/:id`
- **THEN** the DOM contains exactly one `[data-component="tools-toolbar"]` element
- **AND** no other element mounts the universal-tool row or mode-tool row

#### Scenario: Dead duplicate removed

- **WHEN** the implementation is inspected
- **THEN** the file previously exported as `Toolbar` from `packages/client/src/ui/Toolbar.tsx` does not exist
- **AND** no test references its symbols (`Toolbar`, `ROLE_LABEL`, the hidden `<span>` elements kept solely to satisfy legacy smoke tests)

#### Scenario: Single ship-target provider

- **WHEN** `BoardPage` composes the canvas
- **THEN** it mounts exactly one toolbar component (`ToolsToolbar`) and one mode-tabs component (`ModeTabs`)
- **AND** no second toolbar component, no `display: none` placeholder container, and no override-mounting wrapper exists between the page container and the toolbar element

### Requirement: Single-Mount Toolbar Source of Truth

The board surface SHALL have one component that owns the visible list of available tools and one source of truth for which tool is active. The component SHALL consume the `ToolDefinition` registry (in `@gridboard/domain`) instead of re-declaring its own tool list.

#### Scenario: Registry-driven listing

- **WHEN** the toolbar renders
- **THEN** its buttons come from the `ToolDefinition` registry filtered by `modes`
- **AND** adding a tool to the registry makes the button appear without editing the toolbar source

#### Scenario: Dead phantom component absent

- **WHEN** the canvas is inspected
- **THEN** no `PixiCanvas`-style wrapper exists between `BoardPage` and the PixiJS `<canvas>` element
- **AND** PixiJS lifecycle is owned by `CanvasController` only

### Requirement: Minimap Click Navigates Once

The minimap SHALL respond to a primary pointer-down gesture by centering the main canvas on the corresponding board position. It MUST NOT register an additional `click` handler on the same surface; pointer-down plus click on one gesture MUST produce exactly one navigation event.

#### Scenario: Single click navigates once

- **WHEN** the user clicks the minimap with the primary mouse button
- **THEN** `onNavigate` is called exactly once with the board point under the cursor
- **AND** the main canvas re-centers on that point

#### Scenario: Drag-to-pan emits per-move events only

- **WHEN** the user presses the primary pointer on the minimap and drags
- **THEN** `onNavigate` is called per pointer-move (live pan) plus exactly one final navigation on pointer-up
- **AND** no duplicate navigation fires from a synthetic `click` event after pointer-up

#### Scenario: Non-primary buttons ignored

- **WHEN** the user presses the right or middle mouse button on the minimap
- **THEN** no navigation occurs

#### Scenario: Pointer-capture defends against double-fire

- **WHEN** the user is mid-drag with pointer capture active
- **THEN** a second pointer-down on the same surface does not produce a duplicate navigate call

### Requirement: No Phantom Wrapper Components

The canvas pipeline SHALL contain no React component whose sole responsibility is to wrap the PixiJS `<canvas>` element without rendering anything user-visible. The `<canvas>` element SHALL be mounted imperatively by `CanvasController` from the `containerRef` returned by `BoardPage`.

#### Scenario: No display:none wrapper

- **WHEN** the canvas DOM is inspected at runtime
- **THEN** no element exists between `BoardPage`'s `containerRef` div and the PixiJS `<canvas>` styled with `display: none` or `aria-hidden="true"`
- **AND** no React component in the canvas module is named for its content if its only render is `null` or a hidden div

