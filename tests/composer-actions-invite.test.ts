import assert from 'node:assert/strict';
import test from 'node:test';
import { runComposerDraft } from './helpers/composer-actions-test-helpers.js';

test('/invite sends an IRC invite for an explicit channel', async () => {
  const result = await runComposerDraft('/invite alice #ops');

  assert.deepEqual(result.sent, [
    {
      type: 'raw.send',
      networkId: 'network-1',
      raw: 'INVITE alice #ops',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
});

test('/invite uses the current channel when no channel is provided', async () => {
  const result = await runComposerDraft('/invite alice');

  assert.deepEqual(result.sent, [
    {
      type: 'raw.send',
      networkId: 'network-1',
      raw: 'INVITE alice #general',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
});

test('/invite rejects missing nicks and invalid channels', async () => {
  const missingNick = await runComposerDraft('/invite');
  const invalidChannel = await runComposerDraft('/invite alice ops');

  assert.deepEqual(missingNick.sent, []);
  assert.deepEqual(missingNick.drafts, []);
  assert.deepEqual(missingNick.banners, [{ kind: 'error', message: 'Usage: /invite nick [#channel]' }]);
  assert.deepEqual(invalidChannel.sent, []);
  assert.deepEqual(invalidChannel.drafts, []);
  assert.deepEqual(invalidChannel.banners, [
    { kind: 'error', message: 'Channel name must start with #, &, +, or !' },
  ]);
});
