import assert from 'node:assert/strict';
import test from 'node:test';
import { createComposerStore } from '../web/src/composer-store.js';

test('composer hydrates durable drafts without treating them as local edits', () => {
  const composer = createComposerStore();
  const edits: Array<{ body: string; bufferId: string }> = [];
  composer.subscribeDrafts((bufferId, body) => {
    edits.push({ bufferId, body });
  });

  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'restored after restart',
    updatedAt: 1,
  }]);

  assert.equal(composer.getDraft('buffer-1'), 'restored after restart');
  assert.deepEqual(edits, []);
});

test('composer keeps newer local typing while an older server response arrives', () => {
  const composer = createComposerStore();
  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'old server value',
    updatedAt: 1,
  }]);
  composer.setDraft('buffer-1', 'new local value');

  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'old server value',
    updatedAt: 1,
  }]);
  assert.equal(composer.getDraft('buffer-1'), 'new local value');

  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'new local value',
    updatedAt: 2,
  }]);
  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'edit from another window',
    updatedAt: 3,
  }]);
  assert.equal(composer.getDraft('buffer-1'), 'edit from another window');
});

test('composer removes a draft after the durable clear is acknowledged', () => {
  const composer = createComposerStore();
  composer.applyServerDrafts([{
    bufferId: 'buffer-1',
    networkId: 'network-1',
    body: 'send this',
    updatedAt: 1,
  }]);
  composer.setDraft('buffer-1', '');
  composer.applyServerDrafts([]);

  assert.equal(composer.getDraft('buffer-1'), '');
  assert.equal(composer.hasDraft('buffer-1'), false);
});
