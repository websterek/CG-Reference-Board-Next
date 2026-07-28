---
name: auth
description: "GridBoard authentication and authorization. Use when changing users, sessions, board permissions, sharing modes, asset access, realtime connection auth, worker-job authorization, or security boundaries for private/shared/view-only/editable boards."
---

# GridBoard Auth and Permissions

GridBoard is self-hosted but still treats every boundary as hostile. Enforce
authorization on HTTP APIs, realtime connections and updates, asset requests,
background jobs, and storage access.

## Permission model

- Boards support private, shared, view-only, and editable access.
- Persist durable grants in PostgreSQL; do not infer durable access from Yjs
  presence, client UI state, or cached board documents.
- Check permissions at the server boundary before returning board metadata,
  assets, collaboration connection details, or worker job status.
- Re-check write permissions for realtime updates. A client allowed to connect
  view-only must not be able to mutate shared types.

## Asset and media access

- Imported media is copied into server-controlled storage and referenced by a
  stable asset ID.
- Authorize every asset read by board membership and role.
- Worker jobs must carry enough authenticated context to prove the requester can
  save the imported content to the target board.
- Never trust filenames, MIME types, URLs, object keys, or duration/size claims
  supplied by clients.

## Session guidance

- Keep session identity separate from board roles.
- Prefer explicit `userId`, `boardId`, and role checks over broad request flags.
- Log authorization failures without leaking tokens, cookies, object keys, or
  private board names.

## Tests to add when affected

- private board denied to non-member;
- view-only member can read but cannot mutate;
- editable member can mutate board items and upload/import assets;
- revoked member loses HTTP, asset, realtime, and worker-job access.
