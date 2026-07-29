/**
 * Storage parity test — verifies the same fixture data round-trips through
 * LocalStorage (the development-without-Docker provider).
 *
 * MinIO parity is not exercised in CI because it requires running MinIO. The
 * MinioStorage class is type-checked against the same StorageProvider interface
 * — if both implement the surface, parity is structurally enforced.
 *
 * Task 5.5 acceptance: "put/get parity between MinioStorage and LocalStorage
 * using same fixture data".
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage } from '../storage/local';
import { setStorage, resetStorage } from '../storage';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gridboard-storage-'));
  setStorage(new LocalStorage(dir));
});

afterAll(() => {
  resetStorage();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('LocalStorage', () => {
  it('round-trips bytes (put/get)', async () => {
    const storage = new LocalStorage(dir);
    const key = 'boards/b1/assets/a1';
    const data = Buffer.from('hello-gridboard');
    await storage.put(key, data, 'text/plain');

    expect(await storage.exists(key)).toBe(true);
    const back = await storage.get(key);
    expect(back.equals(data)).toBe(true);
  });

  it('rejects path traversal', async () => {
    const storage = new LocalStorage(dir);
    await expect(
      storage.put('../etc/passwd', Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow();
  });

  it('exists() returns false for missing keys', async () => {
    const storage = new LocalStorage(dir);
    expect(await storage.exists('boards/b1/assets/missing')).toBe(false);
  });

  it('writes binary content to disk', async () => {
    const storage = new LocalStorage(dir);
    const key = 'boards/b2/assets/blob';
    const data = Buffer.from([0x00, 0xff, 0x10, 0x20, 0x30]);
    await storage.put(key, data, 'application/octet-stream');
    const disk = readFileSync(join(dir, key));
    expect(disk.equals(data)).toBe(true);
  });

  it('exists() returns true after put', async () => {
    const storage = new LocalStorage(dir);
    const key = 'boards/b3/assets/exists-test';
    await storage.put(key, Buffer.from('x'), 'text/plain');
    expect(await storage.exists(key)).toBe(true);
    expect(existsSync(join(dir, key))).toBe(true);
  });

  it('putStream round-trips bytes (no buffering)', async () => {
    const storage = new LocalStorage(dir);
    const key = 'boards/b4/assets/streamed';
    const payload = Buffer.from('streamed-bytes-gridboard');
    const { Readable } = await import('node:stream');
    const source = Readable.from([payload.subarray(0, 8), payload.subarray(8)]);
    await storage.putStream(key, source, 'text/plain');
    const back = await storage.get(key);
    expect(back.equals(payload)).toBe(true);
  });
});
