/**
 * Paste-image flow — pure helpers for reading an image from the
 * clipboard, probing its natural dimensions, and uploading it to
 * the server.
 *
 * Per paste-image-with-cover-fit D5:
 *   1. Read the clipboard (paste event items OR navigator.clipboard.read()).
 *   2. Probe natural size via URL.createObjectURL + Image.decode().
 *   3. Upload the file via `uploadImage`.
 *
 * The function is split so the controller can compose its own
 * paste handler (which knows about lastPointerBoard, defaultImageSize,
 * and the Yjs adapter).
 */

import { uploadImage, type UploadedAsset } from './upload';

export interface PastedImage {
  /** The image file as read from the clipboard or a File picker. */
  file: File;
  /** The MIME type reported by the clipboard / file. */
  mimeType: string;
  /** Natural pixel width of the image. */
  naturalWidth: number;
  /** Natural pixel height of the image. */
  naturalHeight: number;
}

/**
 * Read an image from the system clipboard via the given `paste` event
 * (`ClipboardEvent`). Returns null when no image is present.
 *
 * Browser note: Chromium-based browsers expose images on
 * `e.clipboardData.items` as items of kind `'file'` whose `type` starts
 * with `'image/'`. Firefox does not yet expose images on the paste
 * event; callers that need Firefox should use `readImageFromClipboardAPI`.
 */
export function readImageFromPasteEvent(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * Read an image from the system clipboard via the async
 * `navigator.clipboard.read()` API. Returns null when no image is
 * present, or when the API is unavailable / rejected (e.g. user
 * permission denied).
 */
export async function readImageFromClipboardAPI(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      // The ClipboardItem already gives us a Blob with the right MIME
      // type. If it's already a File (some test mocks and a few
      // browser implementations preserve the original File), return
      // it directly so callers see the same instance. Otherwise wrap
      // the blob in a File with a synthesized name.
      if (blob instanceof File) {
        return blob;
      }
      const name = `pasted.${imageType.split('/')[1] ?? 'png'}`;
      return new File([blob], name, { type: imageType });
    }
    return null;
  } catch {
    // Permission denied or no document focus — treat as "no image".
    return null;
  }
}

/**
 * Probe the natural pixel dimensions of a File/Blob by creating a
 * temporary object URL, decoding it in an `Image`, and reading
 * `naturalWidth` / `naturalHeight`. The URL is revoked before
 * returning to avoid leaks.
 *
 * The `probeNaturalDims` function is exported separately so tests
 * can inject a fake `Image` constructor and exercise decode failures
 * without going through the network.
 */
export async function probeNaturalDims(
  file: File | Blob,
  deps: { createImage?: () => HTMLImageElement } = {},
): Promise<{ naturalWidth: number; naturalHeight: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = deps.createImage ? deps.createImage() : new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error('image has zero natural dimensions');
    }
    return { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Read an image from the clipboard, probe its natural size, and
 * return a fully-resolved `PastedImage`. Returns null when no image
 * is present. Throws when decode fails.
 *
 * The flow:
 *   1. Try the paste event first (when provided) — synchronous,
 *      faster, and works without a permission prompt.
 *   2. Fall back to navigator.clipboard.read() — requires user
 *      permission and a focused document.
 */
export async function readPastedImage(
  event?: ClipboardEvent | null,
): Promise<PastedImage | null> {
  let file: File | null = null;
  if (event) {
    file = readImageFromPasteEvent(event);
  }
  if (!file) {
    file = await readImageFromClipboardAPI();
  }
  if (!file) return null;
  const dims = await probeNaturalDims(file);
  return {
    file,
    mimeType: file.type,
    naturalWidth: dims.naturalWidth,
    naturalHeight: dims.naturalHeight,
  };
}

/**
 * Upload a pasted image to the server and return the asset record.
 * Wraps `uploadImage` so the paste flow can compose clipboard + decode
 * + upload in a single function.
 */
export async function uploadImageFromBlob(
  boardId: string,
  file: File | Blob,
  filename = 'pasted.png',
): Promise<UploadedAsset> {
  return await uploadImage(boardId, file, filename);
}
