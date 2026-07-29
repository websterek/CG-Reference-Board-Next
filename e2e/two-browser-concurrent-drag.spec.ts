/**
 * Task 12.12: Two-browser concurrent drag — no torn position.
 *
 * D1 torn-position fix: position is written as a nested `pos: Y.Map<{x, y}>`
 * sub-object, so the WHOLE position is one LWW unit on conflict. Concurrent
 * drags from two users MUST converge to a single {x, y} pair (not "x from A,
 * y from B").
 */

import { test, expect } from '@playwright/test';
import { createBoard } from './fixtures/board';

test.describe('Concurrent drag — D1 nested-pos fix', () => {
  test('concurrent drags converge to one coherent (x, y) — no torn position', async ({
    browser,
  }) => {
    const { boardId, ownerToken, secondToken } = await createBoard();

    const userA = await browser.newContext();
    const userB = await browser.newContext();
    const pageA = await userA.newPage();
    const pageB = await userB.newPage();

    await pageA.addInitScript(
      ({ id, token }: { id: string; token: string }) => {
        localStorage.setItem(`gridboard:token:${id}`, token);
      },
      { id: boardId, token: ownerToken },
    );
    await pageB.addInitScript(
      ({ id, token }: { id: string; token: string }) => {
        localStorage.setItem(`gridboard:token:${id}`, token);
      },
      { id: boardId, token: secondToken },
    );

    await pageA.goto(`/board/${boardId}`);
    await pageB.goto(`/board/${boardId}`);
    await pageA.getByTestId('canvas').waitFor();

    // Seed: create one rectangle in the middle.
    const canvas = pageA.getByTestId('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await pageA.getByLabel('Rectangle tool').click();
    await pageA.mouse.move(cx - 40, cy - 40);
    await pageA.mouse.down();
    await pageA.mouse.move(cx + 40, cy + 40, { steps: 5 });
    await pageA.mouse.up();

    // Concurrently: user A drags to (cx + 200, cy); user B drags to (cx, cy + 200).
    await pageA.getByLabel('Select tool').click();
    await pageB.getByLabel('Select tool').click();

    // User A starts a drag first.
    await pageA.mouse.move(cx, cy);
    await pageA.mouse.down();
    await pageA.mouse.move(cx + 100, cy, { steps: 5 });

    // User B starts their drag from approximately the same point (race).
    await pageB.mouse.move(cx, cy);
    await pageB.mouse.down();
    await pageB.mouse.move(cx, cy + 80, { steps: 5 });

    await pageA.mouse.up();
    await pageB.mouse.up();

    // Wait for the Yjs round-trip to settle on both clients.
    await pageA.waitForTimeout(500);
    await pageB.waitForTimeout(500);

    // Read the item's persisted position from the Y.Doc on both clients.
    // Either client's `__gridboard_first_item` should always be a coherent
    // {x, y} where both came from the SAME user (the LWW winner) — proving
    // no torn position where x and y originated from different writers.
    const positions = await Promise.all([
      pageA.evaluate(() => {
        const w = window as unknown as { __gridboard_first_item?: { x: number; y: number } };
        return w.__gridboard_first_item ?? null;
      }),
      pageB.evaluate(() => {
        const w = window as unknown as { __gridboard_first_item?: { x: number; y: number } };
        return w.__gridboard_first_item ?? null;
      }),
    ]);

    expect(positions[0]).not.toBeNull();
    expect(positions[1]).not.toBeNull();

    // Both clients must agree on the converged (x, y).
    expect(positions[0]).toEqual(positions[1]);

    // The (x, y) must be "all-A" (cx + 100, cy) or "all-B" (cx, cy + 80),
    // never mixed.
    const aWon = positions[0]!.x > cx && Math.abs(positions[0]!.y - cy) < 1;
    const bWon = Math.abs(positions[0]!.x - cx) < 1 && positions[0]!.y > cy;
    expect(aWon || bWon).toBe(true);

    await userA.close();
    await userB.close();
  });
});
