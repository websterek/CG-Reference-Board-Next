/**
 * YjsBoardAdapter tests — per-item delta emission, nested pos writes (D1),
 * round-trip snapshot correctness, layer migration (D3), remote overlap
 * correction (D4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { YjsBoardAdapter } from '../src/collab/YjsBoardAdapter';
import {
  asItemId,
  asLayerId,
  layerKindFor,
  type BoardItem,
  type LayerKind,
} from '@gridboard/domain';

// We re-create the local BoardItem type shape (no compile-time import from
// @gridboard/domain here — keeps the test fully client-side and avoids Vitest
// path juggling). The runtime Y.Doc is what matters.
const ITEM_ID = 'item-1';

function newDoc() {
  return new Y.Doc();
}

function mkItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: asItemId(ITEM_ID),
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 80,
    height: 60,
    rotation: 0,
    layerId: asLayerId('media'),
    attrs: { fillColor: '#4A90D9', strokeColor: '#000000', strokeWidth: 2 },
    ...overrides,
  };
}

describe('YjsBoardAdapter', () => {
  let doc: Y.Doc;
  let adapter: YjsBoardAdapter;

  beforeEach(() => {
    doc = newDoc();
    adapter = new YjsBoardAdapter(doc);
  });

  it('writes nested pos sub-map on applyLocalAction (D1 torn-position fix)', () => {
    adapter.createLocal(mkItem());
    adapter.applyLocalAction({ id: ITEM_ID, partial: { x: 100, y: 200 } });

    const itemsMap = doc.getMap('root').get('items') as Y.Map<Y.Map<unknown>>;
    const entry = itemsMap.get(ITEM_ID) as Y.Map<unknown>;
    const pos = entry.get('pos') as Y.Map<number>;
    expect(pos.get('x')).toBe(100);
    expect(pos.get('y')).toBe(200);
  });

  it('emits per-item delta when remote changes happen', async () => {
    adapter.createLocal(mkItem());
    const received: Array<{ id: string; partial: Partial<BoardItem> }> = [];
    adapter.onItemChanged((u) => received.push(u));

    // Mutate from another adapter to simulate a remote update.
    const remote = new YjsBoardAdapter(doc);
    remote.applyLocalAction({ id: ITEM_ID, partial: { x: 50, y: 60 } });

    // Wait one microtask tick for observer to flush.
    await Promise.resolve();

    expect(received.length).toBeGreaterThan(0);
    const last = received[received.length - 1];
    expect(last?.id).toBe(ITEM_ID);
    expect(last?.partial.x).toBe(50);
    expect(last?.partial.y).toBe(60);
  });

  it('export from snapshot equals domain state after writes', () => {
    adapter.createLocal(mkItem({ x: 10, y: 20, width: 30, height: 40 }));
    adapter.applyLocalAction({ id: ITEM_ID, partial: { x: 100, y: 200 } });
    const items = adapter.toDomainItems();
    expect(items.length).toBe(1);
    const it = items[0]!;
    expect(it.x).toBe(100);
    expect(it.y).toBe(200);
    expect(it.width).toBe(30);
    expect(it.height).toBe(40);
  });

  it('deleteLocal removes the item from the Y.Doc', () => {
    adapter.createLocal(mkItem());
    adapter.deleteLocal(ITEM_ID as never);
    expect(adapter.toDomainItems().length).toBe(0);
  });

  it('queueUpdate + flush emits exactly one Yjs transaction', () => {
    adapter.createLocal(mkItem());
    let transactions = 0;
    doc.on('afterTransaction', () => transactions++);
    adapter.queueUpdate(ITEM_ID, { x: 1, y: 1 });
    adapter.queueUpdate(ITEM_ID, { x: 2, y: 2 });
    adapter.queueUpdate(ITEM_ID, { x: 3, y: 3 });
    expect(transactions).toBe(0); // not yet flushed
    adapter.flushQueuedUpdates();
    expect(transactions).toBe(1);
  });

  // ----- Task 4.5: Legacy migration -----

  it('migrates a legacy board (single default layer, three items) to five fixed layers (4.5)', () => {
    // Pre-seed a Y.Doc with legacy structure.
    const legacyDoc = new Y.Doc();
    const root = legacyDoc.getMap('root');

    // Legacy layers array with one entry.
    const legacyLayers = new Y.Array<Y.Map<unknown>>();
    const legacyLayer = new Y.Map<unknown>();
    legacyLayer.set('id', 'default');
    legacyLayer.set('name', 'Layer 1');
    legacyLayer.set('order', 0);
    legacyLayer.set('visible', true);
    legacyLayer.set('locked', false);
    legacyLayers.push([legacyLayer]);
    root.set('layers', legacyLayers);

    // Three legacy items with layerId: 'default'.
    const legacyItems = new Y.Map<Y.Map<unknown>>();
    for (let i = 0; i < 3; i++) {
      const entry = new Y.Map<unknown>();
      entry.set('id', `item-${i}`);
      entry.set('type', 'rectangle');
      entry.set('layerId', 'default');
      entry.set('x', i * 100);
      entry.set('y', 0);
      entry.set('width', 80);
      entry.set('height', 60);
      entry.set('rotation', 0);
      entry.set('attrs', {});
      const pos = new Y.Map<number>();
      pos.set('x', i * 100);
      pos.set('y', 0);
      entry.set('pos', pos);
      legacyItems.set(`item-${i}`, entry);
    }
    root.set('items', legacyItems);

    // Construct adapter — migration runs in constructor.
    const migrated = new YjsBoardAdapter(legacyDoc);

    // Verify layers: 5 fixed layers (frame, media, overlay, connector, annotation).
    const layersArr = root.get('layers') as Y.Array<Y.Map<unknown>>;
    const layers = layersArr.toArray();
    expect(layers.length).toBe(5);
    const layerIds = layers.map((l) => l.get('id'));
    expect(layerIds).toEqual(['frames', 'media', 'overlay', 'connectors', 'annotations']);

    // Verify all three items now have layerId: 'media'.
    const itemsMap = root.get('items') as Y.Map<Y.Map<unknown>>;
    itemsMap.forEach((entry) => {
      expect(entry.get('layerId')).toBe('media');
    });
    expect(migrated.toDomainItems().length).toBe(3);
  });

  // ----- Task 4.6: Fresh board bootstrap -----

  it('seeds a fresh board with five fixed layers on first connect (4.6)', () => {
    // Empty Y.Doc — no layers, no items.
    const freshDoc = new Y.Doc();
    const freshAdapter = new YjsBoardAdapter(freshDoc);

    const root = freshDoc.getMap('root');
    const layersArr = root.get('layers') as Y.Array<Y.Map<unknown>>;
    const layers = layersArr.toArray();
    expect(layers.length).toBe(5);

    const layerIds = layers.map((l) => l.get('id'));
    expect(layerIds).toEqual(['frames', 'media', 'overlay', 'connectors', 'annotations']);

    const orders = layers.map((l) => l.get('order'));
    expect(orders).toEqual([0, 1, 2, 3, 4]);

    // Each layer should have kind set.
    const kinds = layers.map((l) => l.get('kind'));
    expect(kinds).toEqual(['frame', 'media', 'overlay', 'connector', 'annotation']);
  });

  // ----- Task 4.7: layerKind for rectangle -----

  it('layerKind for rectangle returns media (4.7)', () => {
    expect(layerKindFor('rectangle')).toBe('media');
  });

  // ----- Task 8.3: Remote overlap correction -----

  it('corrects a remote update that would overlap a same-layer item (8.3)', async () => {
    // Create item A at (0, 0, 40, 40).
    adapter.createLocal(mkItem({
      id: asItemId('item-a'),
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    }));

    // Create item B at (100, 100, 40, 40).
    adapter.createLocal(mkItem({
      id: asItemId('item-b'),
      x: 100,
      y: 100,
      width: 40,
      height: 40,
    }));

    // Simulate a remote move of B to (0, 0) which would overlap A.
    const remoteUpdate = {
      id: 'item-b',
      partial: { x: 0, y: 0, width: 40, height: 40 },
    };

    const result = adapter.validateAndCorrectRemote(remoteUpdate);

    // Should not be null (a free cell should be found).
    expect(result).not.toBeNull();

    if (result) {
      // The corrected position should not overlap item A.
      const items = adapter.toDomainItems();
      const itemA = items.find((i) => i.id === 'item-a')!;

      // The corrected rect should not overlap item A.
      const correctedRect = {
        x: result.partial.x as number,
        y: result.partial.y as number,
        width: (result.partial.width as number) ?? 40,
        height: (result.partial.height as number) ?? 40,
      };

      // Verify no overlap with item A.
      const overlaps =
        correctedRect.x < itemA.x + itemA.width &&
        correctedRect.x + correctedRect.width > itemA.x &&
        correctedRect.y < itemA.y + itemA.height &&
        correctedRect.y + correctedRect.height > itemA.y;
      expect(overlaps).toBe(false);

      // Verify the corrected position is different from the original (0,0).
      expect(result.partial.x !== 0 || result.partial.y !== 0).toBe(true);
    }
  });
});
