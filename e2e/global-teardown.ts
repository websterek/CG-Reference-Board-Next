/**
 * Playwright global teardown — tears down the compose stack only if THIS
 * process owned the bring-up (sentinel file written by global-setup).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { SENTINEL } from './global-setup';

const REPO = resolve(__dirname, '..');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(SENTINEL)) return;
  // eslint-disable-next-line no-console
  console.log('[playwright globalTeardown] docker compose down');
  spawnSync('docker', ['compose', '-f', 'docker-compose.yml', 'down'], {
    cwd: REPO,
    stdio: 'inherit',
  });
  rmSync(SENTINEL, { force: true });
}