import assert from 'node:assert/strict';
import test from 'node:test';
import { TranscriptScrollSnapshotStore } from '../web/src/transcript/scroll-snapshot-store.js';

test('transcript snapshot store prunes snapshots for closed buffers', () => {
  const snapshots = new TranscriptScrollSnapshotStore();
  snapshots.set('first', { kind: 'latest' });
  snapshots.set('second', { kind: 'anchor', rowKey: 'message:2' });
  snapshots.set('third', { kind: 'latest' });

  const removed = snapshots.prune(['first', 'third']);

  assert.equal(removed, 1);
  assert.equal(snapshots.size, 2);
  assert.deepEqual(snapshots.get('first'), { kind: 'latest' });
  assert.equal(snapshots.get('second'), null);
  assert.deepEqual(snapshots.get('third'), { kind: 'latest' });
});

test('transcript snapshot store replaces and deletes snapshots by buffer', () => {
  const snapshots = new TranscriptScrollSnapshotStore();
  snapshots.set('buffer', { kind: 'latest' });
  snapshots.set('buffer', { kind: 'anchor', rowKey: 'message:3' });

  assert.equal(snapshots.size, 1);
  assert.deepEqual(snapshots.get('buffer'), {
    kind: 'anchor',
    rowKey: 'message:3',
  });
  assert.equal(snapshots.delete('buffer'), true);
  assert.equal(snapshots.get('buffer'), null);
});

test('transcript snapshot store evicts the oldest snapshot at capacity', () => {
  const snapshots = new TranscriptScrollSnapshotStore(2);
  snapshots.set('first', { kind: 'latest' });
  snapshots.set('second', { kind: 'latest' });
  assert.deepEqual(snapshots.get('first'), { kind: 'latest' });
  snapshots.set('third', { kind: 'latest' });

  assert.equal(snapshots.size, 2);
  assert.equal(snapshots.get('second'), null);
  assert.deepEqual(snapshots.get('first'), { kind: 'latest' });
  assert.deepEqual(snapshots.get('third'), { kind: 'latest' });
});
