/**
 * Docker Compose boot smoke test.
 *
 * Boots the full compose stack via `docker compose up -d`, polls the server's
 * `/health` for up to 30s, asserts the `migrate` sidecar exited 0, and
 * tears down with `docker compose down`.
 *
 * Skipped automatically when `docker info` is unavailable. The skip message
 * points the developer at `docker compose up -d` as the manual alternative.
 *
 * Tasks 4.1 - 4.4 (Phase 2 acceptance gate for the docker-compose stack).
 */

import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../');
const COMPOSE = 'docker-compose.yml';

function dockerAvailable(): { ok: boolean; reason?: string } {
  const probe = spawnSync('docker', ['info'], { stdio: 'pipe' });
  if (probe.status === 0) return { ok: true };
  return {
    ok: false,
    reason:
      probe.error?.message ?? `docker info exited with code ${probe.status}`,
  };
}

const docker = dockerAvailable();
const skipReason = docker.ok
  ? undefined
  : `Docker unavailable (${docker.reason}). Phase 2 compose verification requires a running Docker daemon.`;

let composeUp = false;

beforeAll(() => {
  if (!docker.ok) return;
});

afterAll(async () => {
  if (!composeUp) return;
  spawnSync('docker', ['compose', '-f', COMPOSE, 'down'], {
    cwd: REPO,
    stdio: 'inherit',
  });
});

describe('compose-boot', () => {
  it.skipIf(!docker.ok)('boots server and /health responds within 30s', async () => {
    // 1. bring the stack up
    const up = spawnSync('docker', ['compose', '-f', COMPOSE, 'up', '-d'], {
      cwd: REPO,
      stdio: 'inherit',
    });
    if (up.status !== 0) {
      throw new Error(`docker compose up failed (status=${up.status})`);
    }
    composeUp = true;

    // 2. poll /health for up to 30s
    const deadline = Date.now() + 30_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const res = await fetch('http://127.0.0.1:3000/health');
        if (res.status === 200) {
          const body = (await res.json()) as { ok: boolean };
          if (body.ok) {
            return;
          }
        }
      } catch (err) {
        lastError = err;
      }
      await delay(1000);
    }
    throw new Error(
      `Server /health did not return ok within 30s: ${String(lastError)}`,
    );
  }, 60_000);

  it.skipIf(!docker.ok)(
    'migrate sidecar exited 0 (docker compose ps)',
    () => {
      const out = spawnSync(
        'docker',
        ['compose', '-f', COMPOSE, 'ps', '--format', '{{.Service}} {{.State}}'],
        { cwd: REPO, encoding: 'utf8' },
      );
      if (out.status !== 0) {
        throw new Error(`docker compose ps failed: ${out.stderr}`);
      }
      // The migrate service should be 'exited (0)' (success) after running
      // once. Some compose versions print 'exited 0' or similar; we accept
      // any line that mentions migrate + exited.
      const migrateLine = out.stdout
        .split('\n')
        .find((line) => line.toLowerCase().startsWith('migrate'));
      expect(migrateLine, `no migrate row in compose ps:\n${out.stdout}`).toBeDefined();
      expect(migrateLine!.toLowerCase()).toMatch(/exited.*0/);
    },
  );
});

describe.skipIf(!docker.ok)('compose-boot skip reason', () => {
  // Wrap entire suite so Vitest's skipIf decorator short-circuits before
  // beforeAll. The decorator is a no-op when docker is available.
  it('logs a clear skip reason when docker is unavailable', () => {
    // eslint-disable-next-line no-console
    console.warn(`[compose-boot] skipped: ${skipReason}`);
    expect(skipReason).toBeDefined();
  });
});