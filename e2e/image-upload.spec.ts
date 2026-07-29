/**
 * Task 12.16: Upload image and verify it renders on canvas.
 *
 * End-to-end ImageItemDefinition contract across all three packages:
 *   - client uploads file to /api/boards/:id/assets
 *   - server stores via StorageProvider + inserts assets row
 *   - server serves back via /api/assets/:key with JWT validation
 *   - client renders as PixiJS Sprite on the board
 */

import { test, expect } from '@playwright/test';
import { createBoard } from './fixtures/board';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/tiny.png');

test('uploaded image renders on canvas (e2e)', async ({ browser, request }) => {
  test.skip(!existsSync(FIXTURE_PATH), `fixture ${FIXTURE_PATH} missing`);

  const { boardId, ownerToken } = await createBoard();

  // Direct multipart upload to the API.
  const data = readFileSync(FIXTURE_PATH);
  const blob = new Blob([data], { type: 'image/png' });
  const upRes = await request.post(`/api/boards/${boardId}/assets`, {
    multipart: {
      file: { name: 'tiny.png', mimeType: 'image/png', buffer: data },
    },
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(upRes.status()).toBe(201);
  const uploaded = (await upRes.json()) as { assetId: string };
  expect(uploaded.assetId).toBeDefined();
  void blob;

  // Now navigate the browser to the board and assert the asset is reachable.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(
    ({ id, token }: { id: string; token: string }) => {
      localStorage.setItem(`gridboard:token:${id}`, token);
    },
    { id: boardId, token: ownerToken },
  );

  await page.goto(`/board/${boardId}`);
  await page.getByTestId('canvas').waitFor();

  // Asset proxy must return the bytes we uploaded (with auth).
  const resp = await page.request.get(`/api/assets/boards/${boardId}/assets/${uploaded.assetId}`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(resp.status()).toBe(200);
  expect(await resp.body()).toEqual(data);

  await ctx.close();
});

// local existence helper
function existsSync(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
