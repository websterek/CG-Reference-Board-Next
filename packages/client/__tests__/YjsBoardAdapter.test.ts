/**
 * YjsBoardAdapter tests — per-item delta emission, nested pos writes (D1),
 * round-trip snapshot correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { YjsBoardAdapter } from '../src/collab/YjsBoardAdapter';
import { asItemId, type BoardItem } from '@gridboard/domain';

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
    layerId: 'default' as never,
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
});
