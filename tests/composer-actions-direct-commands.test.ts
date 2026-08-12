import assert from 'node:assert/strict';
import test from 'node:test';
import { runComposerDraft } from './helpers/composer-actions-test-helpers.js';

test('/msg sends a private message without opening or selecting a query buffer', async () => {
  const result = await runComposerDraft('/msg alice hello there');

  assert.deepEqual(result.sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'alice',
      body: 'hello there',
      kind: 'message',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
  assert.deepEqual(result.openedChannels, []);
  assert.deepEqual(result.listedNetworks, []);
  assert.deepEqual(result.openedQueries, []);
});

test('/j joins a channel through the channel opener', async () => {
  const result = await runComposerDraft('/j #help');

  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
  assert.deepEqual(result.openedChannels, [{ networkId: 'network-1', channel: '#help' }]);
  assert.deepEqual(result.listedNetworks, []);
  assert.deepEqual(result.openedQueries, []);
});

test('/query opens or selects a private-message buffer', async () => {
  const result = await runComposerDraft('/query alice');

  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
  assert.deepEqual(result.openedChannels, []);
  assert.deepEqual(result.listedNetworks, []);
  assert.deepEqual(result.openedQueries, [{ networkId: 'network-1', nick: 'alice' }]);
});

test('/q opens or selects a private-message buffer', async () => {
  const result = await runComposerDraft('/q alice');

  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.drafts, ['']);
  assert.deepEqual(result.banners, []);
  assert.deepEqual(result.openedChannels, []);
  assert.deepEqual(result.listedNetworks, []);
  assert.deepEqual(result.openedQueries, [{ networkId: 'network-1', nick: 'alice' }]);
});
