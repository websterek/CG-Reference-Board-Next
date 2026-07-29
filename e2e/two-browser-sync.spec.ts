/**
 * Task 12.11: Open the same board in two browsers and verify real-time sync.
 *
 * Setup:
 *   - Create one board via API.
 *   - Two isolated browser contexts each navigate to /board/:id with the
 *     respective tokens.
 *   - User A creates a rectangle.
 *   - User B's view should reflect the new rectangle within the awareness
 *     flush interval.
 */

import { test, expect } from '@playwright/test';
import { createBoard } from './fixtures/board';

test.describe('Two-user real-time sync', () => {
  test('rectangle created by user A appears in user B', async ({ browser }) => {
    const { boardId, ownerToken, secondToken } = await createBoard();

    const userA = await browser.newContext();
    const userB = await browser.newContext();
    const pageA = await userA.newPage();
    const pageB = await userB.newPage();

    // Inject tokens before app boot; BoardPage reads localStorage on mount.
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
    await pageB.getByTestId('canvas').waitFor();

    // User A: drag a rectangle in the canvas viewport.
    const a = pageA.getByTestId('canvas');
    const box = await a.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');

    await a.hover({ position: { x: box.width / 2 - 50, y: box.height / 2 - 50 } });
    await pageA.getByLabel('Rectangle tool').click();
    await pageA.mouse.down();
    await pageA.mouse.move(
      box.x + box.width / 2 + 30,
      box.y + box.height / 2 + 30,
      { steps: 5 },
    );
    await pageA.mouse.up();

    // User B should see the rectangle mirrored after the Yjs round-trip.
    // We assert on PixiJS display presence via a script injected into the page.
    await expect
      .poll(
        async () =>
          pageB.evaluate(() => {
            const w = window as unknown as { __gridboard_items?: number };
            return w.__gridboard_items ?? 0;
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0);

    await userA.close();
    await userB.close();
  });
});
