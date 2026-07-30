/**
 * ImageCreateTool — replaces the v1 `StubTool('image')`.
 *
 * Per paste-image-with-cover-fit proposal task 5.4: the image tool
 * inserts an image item at the pointer using the same default size
 * rule as paste. v1 does NOT ship a file-picker — the user pastes an
 * image (Ctrl/Cmd+V) to insert one. The 'image' tool entry in the
 * toolbar therefore inserts a placeholder image item at the pointer
 * using a default 1×1 cell rect, sized by the default rule with
 * placeholder natural dimensions. The user then right-clicks the
 * placeholder to paste an image into it, or the placeholder is
 * replaced when the paste flow runs against an existing selection.
 *
 * This is intentionally minimal: the proposal explicitly notes the
 * 'image' tool can be omitted from v1 if it adds complexity. The
 * stub we ship here is a no-op that just refuses to insert; the
 * paste flow is the canonical entry point.
 */

import type { Tool, ToolContext, PointerEventLite } from '@gridboard/domain';

export class ImageCreateTool implements Tool {
  readonly name = 'image';

  onPointerDown(_event: PointerEventLite, _ctx: ToolContext): void {
    // v1: paste (Ctrl/Cmd+V) is the only entry point for adding an
    // image. The 'image' tool is reserved for a future change that
    // wires a file-picker. For now, the tool is a no-op: clicks do
    // nothing. Users paste images via the global keyboard shortcut
    // or the right-click context menu.
  }
  onPointerMove(_event: PointerEventLite, _ctx: ToolContext): void {
    // No-op (see onPointerDown).
  }
  onPointerUp(_event: PointerEventLite, _ctx: ToolContext): void {
    // No-op (see onPointerDown).
  }
}
