import assert from 'node:assert/strict';
import test from 'node:test';
import { runComposerDraft } from './helpers/composer-actions-test-helpers.js';

test('/ns sends a NickServ message without opening a query buffer', async () => {
  const result = await runComposerDraft('/ns help');

  assert.deepEqual(result.sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'NickServ',
      body: 'help',
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

test('/hs sends a HostServ message without opening a query buffer', async () => {
  const result = await runComposerDraft('/hs help');

  assert.deepEqual(result.sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'HostServ',
      body: 'help',
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

test('/hs rejects empty hostserv commands', async () => {
  const result = await runComposerDraft('/hs');

  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.banners, [{ kind: 'error', message: 'Usage: /hs command' }]);
});
