/**
 * Media upload client — wraps the multipart POST to /api/boards/:id/assets.
 */

export interface UploadedAsset {
  assetId: string;
  storageKey: string;
  checksum: string;
}

/**
 * Upload an image File/Blob to the server.
 * Requires a JWT in localStorage at `gridboard:token:{boardId}`.
 */
export async function uploadImage(
  boardId: string,
  file: File | Blob,
  filename = 'pasted.png',
): Promise<UploadedAsset> {
  const token = localStorage.getItem(`gridboard:token:${boardId}`) ?? '';
  const fd = new FormData();
  fd.append('file', file, filename);
  const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/assets`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`upload failed: HTTP ${res.status}`);
  }
  return (await res.json()) as UploadedAsset;
}
