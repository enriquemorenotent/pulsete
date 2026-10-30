import assert from 'node:assert/strict';
import test from 'node:test';
import { createComposerStore } from '../web/src/composer-store.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';
import { decodeServer, encode } from '../shared/protocol-messages.js';
import type { Action } from '../web/src/app-types.js';

test('a rejected message restores and persists its original buffer draft through the wire protocol', () => {
  const composer = createComposerStore();
  const saved: Array<[string, string]> = [];
  composer.subscribeDrafts((id, body) => saved.push([id, body]));
  composer.setDraft('other-conversation', 'unrelated typing');
  const bridge = createServerMessageBridge(() => {}, { recoverRejectedDraft: composer.recoverRejectedDraft });
  bridge.applySocketMessage(decodeServer(encode({
    type: 'error', networkId: 'network', message: 'Cannot send',
    retryDraft: { bufferId: 'original', body: 'rejected text' },
  })));
  assert.equal(composer.getDraft('original'), 'rejected text');
  assert.equal(composer.getDraft('other-conversation'), 'unrelated typing');
  assert.deepEqual(saved.at(-1), ['original', 'rejected text']);
  composer.applyServerDrafts([]);
  assert.equal(composer.getDraft('original'), 'rejected text');
});

test('a late rejection preserves newer typing and makes rejected text recoverable', () => {
  const composer = createComposerStore();
  const actions: Action[] = [];
  composer.setDraft('original', 'newer typing');
  const bridge = createServerMessageBridge((action) => actions.push(action), {
    recoverRejectedDraft: composer.recoverRejectedDraft,
  });
  bridge.applySocketMessage({
    type: 'error', networkId: 'network', message: 'Cannot send',
    retryDraft: { bufferId: 'original', body: 'rejected text' },
  });
  assert.equal(composer.getDraft('original'), 'newer typing');
  assert.ok(actions.some((action) => action.type === 'set-banner' && action.banner?.message.includes('Press Up')));
  composer.recallOlderDraft('original');
  assert.equal(composer.getDraft('original'), 'rejected text');
  composer.recallNewerDraft('original');
  assert.equal(composer.getDraft('original'), 'newer typing');
});

for (const clearRecalledText of [false, true]) {
  test(`late rejection preserves history navigation and unsent draft (cleared=${clearRecalledText})`, () => {
    const composer = createComposerStore();
    composer.recordComposerEntry('original', 'older message');
    composer.recordComposerEntry('original', 'recent message');
    composer.setDraft('original', 'unfinished draft');
    composer.recallOlderDraft('original');
    composer.recallOlderDraft('original');
    if (clearRecalledText) composer.setDraft('original', '');
    const before = composer.getDraft('original');
    assert.equal(composer.recoverRejectedDraft('original', 'rejected message'), 'history');
    assert.equal(composer.getDraft('original'), before);
    composer.recallNewerDraft('original');
    assert.equal(composer.getDraft('original'), 'recent message');
    composer.recallNewerDraft('original');
    assert.equal(composer.getDraft('original'), 'rejected message');
    composer.recallNewerDraft('original');
    assert.equal(composer.getDraft('original'), 'unfinished draft');
  });
}

test('late rejection at the history limit preserves the saved draft and remaining navigation', () => {
  const composer = createComposerStore();
  for (let i = 0; i < 100; i++) composer.recordComposerEntry('original', `sent ${i}`);
  composer.setDraft('original', 'unfinished draft');
  for (let i = 0; i < 100; i++) composer.recallOlderDraft('original');
  composer.recoverRejectedDraft('original', 'rejected message');
  assert.equal(composer.getDraft('original'), 'sent 0');
  composer.recallNewerDraft('original');
  assert.equal(composer.getDraft('original'), 'sent 1');
  for (let i = 0; i < 100; i++) composer.recallNewerDraft('original');
  assert.equal(composer.getDraft('original'), 'unfinished draft');
  assert.equal(composer.getState().original.history.entries.length, 100);
});
