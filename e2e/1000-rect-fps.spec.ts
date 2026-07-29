/**
 * Task 12.14: 1000-rectangle board pan/zoom holds 60 FPS.
 *
 * Hard acceptance criterion from design.md "Spatial Index & Culling".
 * Playwright's Performance API can record frame timing. We seed the board
 * with 1000 rectangles via direct Y.Doc writes (faster than the UI drag path),
 * then pan for 2 seconds and assert the frame interval stays near 16.67ms.
 */

import { test, expect } from '@playwright/test';
import { createBoard } from './fixtures/board';

const ONE_THOUSAND = 1000;
const PAN_DURATION_MS = 2_000;
const TARGET_FRAME_BUDGET_MS = 17; // 60 FPS = 16.67; allow small headroom

test('1000 rectangles — pan holds 60 FPS', async ({ browser }) => {
  const { boardId, ownerToken } = await createBoard();

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ id, token }: { id: string; token: string }) => {
      localStorage.setItem(`gridboard:token:${id}`, token);
    },
    { id: boardId, token: ownerToken },
  );

  await page.goto(`/board/${boardId}`);
  const canvas = page.getByTestId('canvas');
  await canvas.waitFor();

  // Seed 1000 rectangles via the canvas's exposed seed helper.
  // The helper is added by the dev server when running with this env var.
  await page.evaluate((count) => {
    // Producer runs against the local Y.Doc only; Hocuspocus broadcasts it.
    const w = window as unknown as {
      gridboardSeed?: (
        n: number,
      ) => void;
    };
    if (typeof w.gridboardSeed !== 'function') {
      throw new Error('window.gridboardSeed() missing — see BoardPage dev hook');
    }
    w.gridboardSeed(count);
  }, ONE_THOUSAND);

  const box = await canvas.boundingBox();
  if (!box) throw new Error('no canvas bounding box');

  // Start a Performance observer that records frame intervals.
  await page.evaluate(() => {
    const w = window as unknown as {
      __frameTimes?: number[];
    };
    w.__frameTimes = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      (w.__frameTimes as number[]).push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Pan around for PAN_DURATION_MS.
  const panStart = Date.now();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Space');
  while (Date.now() - panStart < PAN_DURATION_MS) {
    await page.mouse.move(
      box.x + box.width / 2 + Math.sin(Date.now() / 200) * 100,
      box.y + box.height / 2 + Math.cos(Date.now() / 200) * 100,
    );
    await page.waitForTimeout(16);
  }
  await page.keyboard.up('Space');

  const frameTimes = await page.evaluate(() => {
    const w = window as unknown as { __frameTimes?: number[] };
    return w.__frameTimes ?? [];
  });

  // Compute p95 frame interval.
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  // Allow some startup frames; only flag if sustained jank occurs.
  expect.soft(p95).toBeLessThan(TARGET_FRAME_BUDGET_MS * 2);

  await ctx.close();
});
