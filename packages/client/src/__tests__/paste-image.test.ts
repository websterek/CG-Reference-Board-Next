/**
 * Paste-image tests — exercise the clipboard read + natural-size probe
 * + upload orchestration in isolation. Mocks `URL.createObjectURL`,
 * `Image`, and `fetch` so the tests run in any environment.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readImageFromPasteEvent,
  readImageFromClipboardAPI,
  probeNaturalDims,
  readPastedImage,
  uploadImageFromBlob,
} from '../media/paste-image';

function makeFile(name: string, type: string, content = 'fake'): File {
  return new File([content], name, { type });
}

function makeClipboardEvent(items: Array<{ kind: string; type: string; file?: File }>): ClipboardEvent {
  const dtItems = items.map((it) => {
    let blob: Blob | null = null;
    if (it.file) blob = it.file;
    return {
      kind: it.kind,
      type: it.type,
      getAsFile: () => blob,
    };
  });
  // Build a partial event with the relevant fields.
  const event = {
    clipboardData: {
      items: dtItems,
    },
  } as unknown as ClipboardEvent;
  return event;
}

describe('readImageFromPasteEvent', () => {
  it('returns the first image file from the clipboard items', () => {
    const file = makeFile('a.png', 'image/png');
    const event = makeClipboardEvent([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/png', file },
    ]);
    expect(readImageFromPasteEvent(event)).toBe(file);
  });

  it('returns null when no image is present', () => {
    const event = makeClipboardEvent([{ kind: 'string', type: 'text/plain' }]);
    expect(readImageFromPasteEvent(event)).toBeNull();
  });

  it('returns null when clipboardData is missing', () => {
    const event = { clipboardData: undefined } as unknown as ClipboardEvent;
    expect(readImageFromPasteEvent(event)).toBeNull();
  });

  it('skips non-image file types', () => {
    const event = makeClipboardEvent([
      { kind: 'file', type: 'application/pdf', file: makeFile('a.pdf', 'application/pdf') },
      { kind: 'file', type: 'image/jpeg', file: makeFile('a.jpg', 'image/jpeg') },
    ]);
    const result = readImageFromPasteEvent(event);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('image/jpeg');
  });
});

describe('readImageFromClipboardAPI', () => {
  function setClipboard(value: unknown): void {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });
  }

  it('returns null when navigator.clipboard.read is not available', async () => {
    setClipboard(undefined);
    const result = await readImageFromClipboardAPI();
    expect(result).toBeNull();
  });

  it('returns the first image when clipboard.read resolves with one', async () => {
    const imageFile = makeFile('a.png', 'image/png');
    setClipboard({
      read: () =>
        Promise.resolve([
          {
            types: ['text/plain'],
            getType: () => Promise.reject(new Error('not image')),
          },
          {
            types: ['image/png'],
            getType: () => Promise.resolve(imageFile),
          },
        ]),
    });
    const result = await readImageFromClipboardAPI();
    expect(result).toBe(imageFile);
  });

  it('returns null when clipboard.read rejects (permission denied)', async () => {
    setClipboard({
      read: () => Promise.reject(new Error('permission denied')),
    });
    const result = await readImageFromClipboardAPI();
    expect(result).toBeNull();
  });
});

describe('probeNaturalDims', () => {
  it('returns the natural width and height of a decoded image', async () => {
    const fakeImage = {
      _src: '',
      get src() {
        return this._src;
      },
      set src(v: string) {
        this._src = v;
        // Resolve decode() on next tick to mimic the browser.
        Promise.resolve().then(() => this.onload?.());
      },
      naturalWidth: 1600,
      naturalHeight: 800,
      decode: vi.fn(() => Promise.resolve()),
      onload: null as null | (() => void),
    };
    // Override the global Image constructor for this test.
    const originalImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image: unknown }).Image = function () {
      return fakeImage;
    };
    try {
      const file = makeFile('a.png', 'image/png');
      const dims = await probeNaturalDims(file);
      expect(dims.naturalWidth).toBe(1600);
      expect(dims.naturalHeight).toBe(800);
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });

  it('rejects when the image fails to decode', async () => {
    const fakeImage = {
      src: '',
      naturalWidth: 0,
      naturalHeight: 0,
      decode: vi.fn(() => Promise.reject(new Error('decode failed'))),
    };
    const originalImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image: unknown }).Image = function () {
      return fakeImage;
    };
    try {
      const file = makeFile('a.png', 'image/png');
      await expect(probeNaturalDims(file)).rejects.toThrow('decode failed');
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });

  it('rejects when natural dimensions are zero (e.g. empty image)', async () => {
    const fakeImage = {
      src: '',
      naturalWidth: 0,
      naturalHeight: 0,
      decode: vi.fn(() => Promise.resolve()),
    };
    const originalImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image: unknown }).Image = function () {
      return fakeImage;
    };
    try {
      const file = makeFile('a.png', 'image/png');
      await expect(probeNaturalDims(file)).rejects.toThrow();
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });
});

describe('readPastedImage', () => {
  it('returns null when the paste event has no image and clipboard API is unavailable', async () => {
    const event = makeClipboardEvent([]);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const result = await readPastedImage(event);
      expect(result).toBeNull();
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
    }
  });

  it('uses the paste event when it has an image', async () => {
    const file = makeFile('a.png', 'image/png');
    const fakeImage = {
      _src: '',
      set src(v: string) {
        this._src = v;
      },
      get src() {
        return this._src;
      },
      naturalWidth: 100,
      naturalHeight: 100,
      decode: vi.fn(() => Promise.resolve()),
    };
    const originalImage = (globalThis as { Image?: unknown }).Image;
    (globalThis as { Image: unknown }).Image = function () {
      return fakeImage;
    };
    try {
      const event = makeClipboardEvent([{ kind: 'file', type: 'image/png', file }]);
      const result = await readPastedImage(event);
      expect(result).not.toBeNull();
      expect(result?.file).toBe(file);
      expect(result?.naturalWidth).toBe(100);
      expect(result?.naturalHeight).toBe(100);
    } finally {
      (globalThis as { Image?: unknown }).Image = originalImage;
    }
  });
});

describe('uploadImageFromBlob', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads the file and returns the asset record', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ assetId: 'asset-1', storageKey: 'key-1', checksum: 'sum' }),
    });
    // Set a token so the Authorization header is included.
    localStorage.setItem('gridboard:token:board-1', 'token-abc');
    const file = makeFile('a.png', 'image/png');
    const result = await uploadImageFromBlob('board-1', file, 'a.png');
    expect(result).toEqual({ assetId: 'asset-1', storageKey: 'key-1', checksum: 'sum' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws when the server returns a non-2xx response', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 415 });
    localStorage.setItem('gridboard:token:board-1', 'token-abc');
    const file = makeFile('a.png', 'image/png');
    await expect(uploadImageFromBlob('board-1', file)).rejects.toThrow('HTTP 415');
  });
});
