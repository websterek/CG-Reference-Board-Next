---
name: ui-design
description: "GridBoard UI/UX design and review. Use for visible React interfaces, board chrome, toolbars, layers panels, inspectors, permissions dialogs, media import states, responsive layout, accessibility, interaction polish, and design QA."
---

# GridBoard UI Design

GridBoard should feel like a precise reference-board tool: calm chrome,
fast canvas interaction, clear spatial hierarchy, and trustworthy media and
sharing states.

## Design principles

- Let the canvas be primary. Keep panels, toolbars, and dialogs quiet and
  predictable.
- Make grid, snap, selection, layer order, zoom, and permissions visible when
  they matter, not constantly noisy.
- Prefer direct manipulation with keyboard shortcuts and accessible alternatives.
- Show import/upload progress as board-safe asset states: queued, processing,
  ready, failed, and permission denied.
- Design view-only and editable modes so users can immediately tell what actions
  are available.

## Interaction checklist

- Pointer, wheel, touchpad, keyboard, and focus behavior are intentional.
- Selection handles remain usable at common zoom levels.
- Panels do not steal canvas gestures unexpectedly.
- Empty, loading, error, reconnecting, offline, and permission-denied states are
  present for collaborative and media workflows.
- Destructive actions explain what board data or assets will be affected.

## Accessibility and responsiveness

- Provide keyboard paths for core commands, layer navigation, dialogs, and media
  controls.
- Keep focus traps and escape behavior correct in modals/popovers.
- Use readable contrast and target sizes in dense toolbars.
- Keep the board usable on laptop-sized screens; avoid layouts that require a
  large monitor for core actions.

## Validation

For meaningful UI changes, run the app and inspect the actual browser behavior.
Report only failures, intentional exceptions, and any remaining design risk.
