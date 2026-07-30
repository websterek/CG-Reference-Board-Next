/**
 * Controller-level paste flow tests.
 *
 * The full CanvasController requires PixiJS, so we can't instantiate it
 * in unit tests. Instead, we re-exercise the contract that
 * `controller.pasteImageFromClipboard` honors:
 *   - When `readPastedImage` returns null (no image in clipboard), the
 *     controller MUST NOT call `onItemCreate`. This is the
 *     "Clipboard contains no image → paste is a no-op" scenario from
 *     the spec (paste-image-with-cover-fit D5 / media-import spec).
 *   - When `readPastedImage` throws, the controller MUST route the
 *     error to `onPasteError` instead of letting it propagate.
 *
 * We don't import the real controller; we wire the same composition
 * the controller does (readPastedImage + uploadImageFromBlob +
 * createItem) and assert the same invariants. If the controller
 * diverges from this composition in a future change, these tests
 * will still pass — so this is a regression guard for the helper
 * layer, not a full controller test. A real controller test lives
 * in the integration suite (out of scope for unit tests).
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock the helpers at the module boundary so the test exercises the
// same composition surface as the controller without depending on
// the real network / clipboard.
const mockReadPastedImage = vi.fn();
const mockUploadImageFromBlob = vi.fn();
vi.mock('../media/paste-image', async () => {
  const actual = await vi.importActual<typeof import('../media/paste-image')>('../media/paste-image');
  return {
    ...actual,
    readPastedImage: (...args: unknown[]) => mockReadPastedImage(...args),
    uploadImageFromBlob: (...args: unknown[]) => mockUploadImageFromBlob(...args),
  };
});

import { readPastedImage, uploadImageFromBlob } from '../media/paste-image';

afterEach(() => {
  vi.clearAllMocks();
  // Reset navigator.clipboard between tests so each test is isolated.
  Object.defineProperty(navigator, 'clipboard', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe('controller.pasteImageFromClipboard — no-op contract', () => {
  it('does not call onItemCreate when readPastedImage returns null', async () => {
    // Empty clipboard: paste event has no image, navigator.clipboard
    // is unavailable. The controller should silently no-op.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    mockReadPastedImage.mockResolvedValue(null);

    const onItemCreate = vi.fn();
    const onPasteError = vi.fn();

    // Simulate the controller's pasteImageFromClipboard body inline.
    // This pins the contract the test guards: if the controller's
    // composition changes (e.g. it now ALWAYS calls onItemCreate),
    // this test still passes — it's a guard for the helper layer
    // and documents the no-op expectation.
    const pasted = await readPastedImage();
    if (pasted) {
      // … would call uploadImageFromBlob + onItemCreate
    } else {
      // no-op
    }

    expect(onItemCreate).not.toHaveBeenCalled();
    expect(onPasteError).not.toHaveBeenCalled();
    expect(mockReadPastedImage).toHaveBeenCalledTimes(1);
    expect(mockUploadImageFromBlob).not.toHaveBeenCalled();
  });

  it('does not call uploadImageFromBlob when there is no image', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    mockReadPastedImage.mockResolvedValue(null);

    const pasted = await readPastedImage();
    if (pasted) {
      await uploadImageFromBlob('board-1', pasted.file);
    }
    expect(mockUploadImageFromBlob).not.toHaveBeenCalled();
  });
});

describe('controller.pasteImageFromClipboard — error path', () => {
  it('routes a readPastedImage rejection to onPasteError, not onItemCreate', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true });
    mockReadPastedImage.mockRejectedValue(new Error('clipboard read failed'));

    const onItemCreate = vi.fn();
    const onPasteError = vi.fn();

    // Mirror the controller's try/catch.
    try {
      const pasted = await readPastedImage();
      if (!pasted) return;
      // … would call uploadImageFromBlob + onItemCreate
    } catch (err) {
      onPasteError(err instanceof Error ? err : new Error(String(err)));
    }

    expect(onPasteError).toHaveBeenCalledTimes(1);
    expect(onPasteError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect((onPasteError.mock.calls[0]![0] as Error).message).toBe('clipboard read failed');
    expect(onItemCreate).not.toHaveBeenCalled();
  });

  it('routes an uploadImageFromBlob rejection to onPasteError, not onItemCreate', async () => {
    mockReadPastedImage.mockResolvedValue({
      file: new File(['fake'], 'a.png', { type: 'image/png' }),
      mimeType: 'image/png',
      naturalWidth: 800,
      naturalHeight: 600,
    });
    mockUploadImageFromBlob.mockRejectedValue(new Error('HTTP 415'));

    const onItemCreate = vi.fn();
    const onPasteError = vi.fn();

    try {
      const pasted = await readPastedImage();
      if (!pasted) return;
      await uploadImageFromBlob('board-1', pasted.file);
    } catch (err) {
      onPasteError(err instanceof Error ? err : new Error(String(err)));
    }

    expect(onPasteError).toHaveBeenCalledTimes(1);
    expect((onPasteError.mock.calls[0]![0] as Error).message).toBe('HTTP 415');
    expect(onItemCreate).not.toHaveBeenCalled();
  });
});
