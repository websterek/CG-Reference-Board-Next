---
name: yjs
description: "Yjs collaboration patterns for GridBoard. Use when modeling board state in Y.Doc, syncing Hocuspocus updates, handling awareness/presence, undo/history, persistence, reconnects, conflict resolution, permissions, or binary document storage."
---

# GridBoard Yjs Collaboration

Yjs is the collaboration source of truth for live board state. Persist Yjs
updates/binary documents; JSON snapshots are exports or read models, not the
collaboration authority.

## Board document shape

- Model items individually, not as one synchronized JSON blob.
- Use stable item IDs as keys in shared maps so concurrent edits converge at
  item granularity.
- Keep durable board state separate from ephemeral presence and local UI state.
- Store positions and sizes in board coordinates; use the shared grid service
  before writing snapped values.
- Keep renderer-specific data out of Yjs. PixiJS should be replaceable.

## Transactions, origins, and undo

- Wrap one user action in `doc.transact(() => { ... }, origin)`.
- Use origins to separate local commands, provider echoes, autosave, imports,
  and undo/redo.
- Scope `Y.UndoManager` to the shared types that represent editable board data.
- Call `stopCapturing()` between logically distinct commands.
- Avoid raw shared-map counters for multi-writer data; partition by client/item
  or use explicit conflict policy.

## Awareness and presence

- Awareness is ephemeral: cursors, selections, names, colors, and connection
  status. Never persist it as board data.
- Clear local awareness on disconnect so stale cursors disappear quickly.
- Do not authorize by awareness state. Authorize at HTTP/realtime boundaries.

## Persistence and snapshots

- Store Yjs binary updates/documents for canonical persistence.
- Generate JSON snapshots only for exports, indexing, thumbnails, or debugging.
- Use state vectors/differential updates for sync instead of full-document
  exchange where practical.
- Test reconnect and offline conflict behavior before changing persistence.

## Hocuspocus/server checks

- Authenticate connection establishment.
- Enforce board role on every update path, including reconnects.
- Deny mutation messages from view-only clients.
- Ensure persistence and awareness cleanup run when clients disconnect or lose
  permission.
