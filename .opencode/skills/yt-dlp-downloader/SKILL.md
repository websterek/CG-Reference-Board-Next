---
name: yt-dlp-downloader
description: "GridBoard media import worker guidance for yt-dlp and FFmpeg. Use when implementing paste/import of remote videos or audio, download jobs, metadata probing, transcoding, thumbnails, duration/size limits, or safe storage of self-hosted playable media."
---

# GridBoard Media Import with yt-dlp and FFmpeg

Remote media import creates a background job. The board stores a stable asset ID
and processing status; playback uses server-controlled storage, not third-party
embeds.

## Safety rules

- Download only content the user is authorized to save to the target board.
- Validate URL protocol, hostname policy, redirects, MIME type, file extension,
  size, duration, and target board permissions before persisting anything.
- Run `yt-dlp`, `ffprobe`, and `ffmpeg` with fixed argument arrays. Never
  interpolate user input into a shell command.
- Use timeouts, byte limits, duration limits, and worker concurrency limits.
- Write to a temporary job directory, then move normalized outputs into object
  storage through the storage interface.
- Strip or normalize untrusted filenames. Persist safe metadata separately.
- Do not log raw URLs when they may contain private tokens.

## Job states

Use explicit states such as:

- `queued`
- `probing`
- `downloading`
- `transcoding`
- `thumbnailing`
- `ready`
- `failed`
- `permission_denied`

Expose progress without trusting the worker as an authorization authority; API
routes still verify access to the board and asset.

## Browser playback

- Normalize video/audio to browser-compatible formats.
- Generate thumbnails and lightweight metadata for board rendering.
- Lazy-load media and show placeholders on the PixiJS canvas; use DOM overlays
  only for interactive playback controls.

## Tests to add when affected

- invalid protocol/URL rejected;
- oversized or over-duration media rejected;
- unauthorized user cannot enqueue or read an imported asset;
- worker failure updates asset status without leaving broken board references;
- FFmpeg/yt-dlp calls are made with argument arrays, not shell strings.
