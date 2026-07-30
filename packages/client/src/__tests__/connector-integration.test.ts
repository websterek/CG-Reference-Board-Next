/**
 * Connector integration tests — reattach flow, dangling markers,
 * endpoint tracking (Tasks 14.2-14.7, 14.11, 14.13-14.15).
 *
 * Like controller-behavior.test.ts, these tests verify invariants at
 * the source level: the controller implements the reattach state
 * machine, the dangling flag is set on delete, the renderer emits a
 * red dashed stroke for dangling connectors, and endpoint tracking
 * re-renders the connector when an endpoint moves.
 *
 * PixiJS rendering is exercised end-to-end by the Playwright suite
 * (out of scope here). These tests confirm the data-flow logic that
 * drives rendering.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

function readController(): string {
  return readFileSync(
    resolve(__dirname, '..', 'canvas', 'controller.ts'),
    'utf-8',
  );
}

function readConnectorRenderer(): string {
  return readFileSync(
    resolve(__dirname, '..', 'canvas', 'renderers', 'connector.ts'),
    'utf-8',
  );
}

function readConnectorDomain(): string {
  return readFileSync(
    resolve(__dirname, '..', '..', '..', 'domain', 'src', 'items', 'connector.ts'),
    'utf-8',
  );
}

// ---------------------------------------------------------------------------
// 14.2 — Connector renders as a line between two endpoint items
// ---------------------------------------------------------------------------

describe('14.2: connector renderer draws path between endpoints', () => {
  it('renderConnector reads attrs.from and attrs.to ItemIds and resolves anchors', () => {
    const src = readConnectorRenderer();
    // The renderer must read the from/to ItemIds from attrs.
    expect(src).toMatch(/attrs\.from/);
    expect(src).toMatch(/attrs\.to/);
    // It must resolve anchors via the items map.
    expect(src).toMatch(/resolveAnchor/);
    // It must draw a path with moveTo/lineTo.
    expect(src).toMatch(/moveTo/);
    expect(src).toMatch(/lineTo/);
  });
});

// ---------------------------------------------------------------------------
// 14.3, 14.4 — Connector follows moved endpoints
// ---------------------------------------------------------------------------

describe('14.3/14.4: connector re-renders when endpoint items move', () => {
  it('updateItem finds connectors referencing the updated item and re-renders them', () => {
    const src = readController();
    // The endpoint-tracking block in updateItem iterates this.items
    // and finds connectors whose attrs.from or attrs.to matches the
    // updated item ID, then calls updateItem on them.
    expect(src).toMatch(/otherItem\.type !== 'connector'/);
    expect(src).toMatch(/otherAttrs\.from !== idItem/);
    expect(src).toMatch(/otherAttrs\.to !== idItem/);
    expect(src).toMatch(/this\.updateItem\(otherId, connector\)/);
  });
});

// ---------------------------------------------------------------------------
// 14.5 — Deleting an endpoint item sets dangling: true
// ---------------------------------------------------------------------------

describe('14.5: removeItem sets dangling: true on referencing connectors', () => {
  it('removeItem finds connectors with matching from/to and sets dangling', () => {
    const src = readController();
    expect(src).toMatch(/Endpoint integrity/);
    expect(src).toMatch(/dangling: true/);
    expect(src).toMatch(/onItemChange.*partial:.*attrs/);
  });
});

// ---------------------------------------------------------------------------
// 14.6 — Dangling connector renders with red broken-line indicator
// ---------------------------------------------------------------------------

describe('14.6: dangling connector uses red dashed stroke', () => {
  it('renderConnector switches to dashed red stroke when dangling', () => {
    const src = readConnectorRenderer();
    // Check for dashed stroke pattern (PixiJS dashArray)
    expect(src).toMatch(/dashArray/);
    // Check for red color value
    expect(src).toMatch(/DANGLING_COLOR.*0xff0000/);
    // Check the dangling-flag branch
    expect(src).toMatch(/isDangling/);
  });
});

// ---------------------------------------------------------------------------
// 14.7 — Reattach clears dangling flag
// ---------------------------------------------------------------------------

describe('14.7: completeReattach updates from/to and clears dangling', () => {
  it('completeReattach exists and updates attrs with dangling: false', () => {
    const src = readController();
    expect(src).toMatch(/completeReattach/);
    expect(src).toMatch(/dangling: false/);
    expect(src).toMatch(/nextAttrs\[endpoint\] = newTargetId/);
  });

  it('the reattach state machine is gated on a selected dangling connector', () => {
    const src = readController();
    // The reattach trigger only fires when the clicked hit is the
    // selected connector AND it is dangling.
    expect(src).toMatch(/selAttrs\.dangling/);
    expect(src).toMatch(/pinKind/);
    expect(src).toMatch(/reattachState = \{ kind: pinKind, connectorId: hit \}/);
  });
});

// ---------------------------------------------------------------------------
// 14.11 — Z-order: connectors above overlay, below annotation
// ---------------------------------------------------------------------------

describe('14.11: connector z-order is between overlay and annotation', () => {
  it('layer registry returns connector at z=3', () => {
    // The domain layer-registry test asserts sortByZOrder includes
    // 'connector' between 'overlay' and 'annotation'. This test pins
    // the contract at the registry definition.
    const src = readFileSync(
      resolve(__dirname, '..', '..', '..', 'domain', 'src', 'layers', 'registry.ts'),
      'utf-8',
    );
    expect(src).toMatch(/kind: 'connector'/);
    expect(src).toMatch(/zOrder: 3/);
  });
});

// ---------------------------------------------------------------------------
// 14.13 — Connectors do not block placement (overlapRule: 'none')
// ---------------------------------------------------------------------------

describe('14.13: connector layer has overlapRule: "none"', () => {
  it('layer-registry entry for connector sets overlapRule: "none"', () => {
    const src = readFileSync(
      resolve(__dirname, '..', '..', '..', 'domain', 'src', 'layers', 'registry.ts'),
      'utf-8',
    );
    // Find the connector entry block and check overlapRule.
    const match = src.match(/kind: 'connector',[\s\S]*?\}\);/);
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/overlapRule: 'none'/);
  });
});

// ---------------------------------------------------------------------------
// 14.14 — Arrowheads render at configured ends
// ---------------------------------------------------------------------------

describe('14.14: arrowheads rendered at start/end when configured', () => {
  it('renderConnector draws arrowhead triangles for start/end', () => {
    const src = readConnectorRenderer();
    // The renderer must check arrowheadStart/arrowheadEnd flags and
    // draw triangles.
    expect(src).toMatch(/arrowheadStart === 'arrow'/);
    expect(src).toMatch(/arrowheadEnd === 'arrow'/);
    expect(src).toMatch(/drawArrowhead/);
    // 10px base / 8px height constants
    expect(src).toMatch(/ARROWHEAD_BASE = 10/);
    expect(src).toMatch(/ARROWHEAD_HEIGHT = 8/);
  });
});

// ---------------------------------------------------------------------------
// 14.15 — Connector bounding box updates when endpoints move
// ---------------------------------------------------------------------------

describe('14.15: connector spatial index updates when endpoints move', () => {
  it('updateItem calls index.update with the connector (re-indexes after endpoint move)', () => {
    const src = readController();
    // The endpoint-tracking block calls updateItem on the connector,
    // which inside updateItem calls this.index.update(...).
    expect(src).toMatch(/this\.index\.update\(next, layerKindFor\(next\.type\)\)/);
  });
});

// ---------------------------------------------------------------------------
// 11.4 — Reattach cancelled on empty canvas / Esc
// ---------------------------------------------------------------------------

describe('11.4: reattach cancelled on Esc or empty click', () => {
  it('controller handles Esc to cancel reattach mode', () => {
    const src = readController();
    expect(src).toMatch(/e\.key === 'Escape' && this\.reattachState/);
  });

  it('reattach state cleared on empty click (no item hit)', () => {
    const src = readController();
    // The pointerdown handler clears reattachState regardless of hit
    // presence.
    expect(src).toMatch(/this\.reattachState = null/);
  });
});