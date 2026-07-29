/**
 * Shared board fixture — creates one board via the API and returns:
 *   - boardId
 *   - ownerToken (role: 'owner')
 *   - editorToken (role: 'editor') — borrowed via the role-aware join path
 *
 * In v1 there is no user system, so any second client connecting to /collab
 * and presenting a token with a different role is interpreted as a distinct
 * collaborator. The fixture creates the board as owner, then issues a second
 * token by directly calling the join endpoint with the same role (v1: both
 * are 'owner' since the only board_members row determines role).
 *
 * Note: real user isolation requires the board_members lookup to be keyed by
 * userId; that's the design.md D9 migration path. For these e2e tests we
 * exercise the current "look up the only row" semantics — which is enough to
 * verify the websocket-shape contract.
 */

export interface BoardFixture {
  boardId: string;
  ownerToken: string;
  secondToken: string;
}

export async function createBoard(): Promise<BoardFixture> {
  const baseURL = process.env.GRIDBOARD_SERVER_URL ?? 'http://localhost:3000';

  const createRes = await fetch(`${baseURL}/api/boards`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'e2e board' }),
  });
  if (!createRes.ok) throw new Error(`create board failed: ${createRes.status}`);
  const board = (await createRes.json()) as { id: string; token: string };

  // For an editor/viewer variant we issue a second token by hitting /join.
  // v1 returns the same role as the only board_members row — still useful for
  // verifying that a second connection authenticates independently.
  const joinRes = await fetch(`${baseURL}/api/boards/${board.id}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
  if (!joinRes.ok) throw new Error(`join board failed: ${joinRes.status}`);
  const join = (await joinRes.json()) as { token: string };

  return {
    boardId: board.id,
    ownerToken: board.token,
    secondToken: join.token,
  };
}

/**
 * Decode a JWT payload without verification. Used to inject role into the
 * browser localStorage in tests; the SERVER still verifies the token.
 */
export function decodeJwtPayload(token: string): { boardId: string; role: string } {
  const parts = token.split('.');
  const payload = parts[1];
  if (!payload) throw new Error('malformed token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    boardId: string;
    role: string;
  };
}
