/**
 * Playwright global setup — boots the docker-compose stack before the e2e
 * suite runs so tests can rely on the server + client being up.
 *
 * Behavior:
 *   - If `docker info` succeeds, runs `docker compose up -d` and waits for
 *     `/health` to return 200. Writes a sentinel file so the teardown knows
 *     it owns the stack.
 *   - If Docker is unavailable, prints a warning and skips; the suite falls
 *     back to whatever is already running on http://localhost:3000 (e.g. a
 *     developer-managed `pnpm dev`).
 */

import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '..');
const TMP = join(REPO, '.playwright-tmp');
export const SENTINEL = join(TMP, 'compose-boot-owned');

export default async function globalSetup(): Promise<void> {
  const probe = spawnSync('docker', ['info'], { stdio: 'pipe' });
  if (probe.status !== 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[playwright globalSetup] docker unavailable; skipping compose boot. ' +
        'Make sure a GridBoard stack is reachable on http://localhost:3000.',
    );
    return;
  }

  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

  // eslint-disable-next-line no-console
  console.log('[playwright globalSetup] booting docker compose stack...');
  const up = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', 'up', '-d'],
    { cwd: REPO, stdio: 'inherit' },
  );
  if (up.status !== 0) {
    throw new Error(`docker compose up failed (status=${up.status})`);
  }
  writeFileSync(SENTINEL, new Date().toISOString());

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('http://127.0.0.1:3000/health');
      if (res.status === 200) {
        // eslint-disable-next-line no-console
        console.log('[playwright globalSetup] /health ok');
        return;
      }
    } catch {
      // not yet ready
    }
    await delay(1000);
  }
  throw new Error('compose stack did not become healthy within 60s');
}