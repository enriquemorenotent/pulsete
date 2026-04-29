import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('nick emoji routes persist per-network entries and broadcast updates without auth', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  const network = context.storage.networks.upsert(createNetworkInput());

  try {
    const upsertPromise = waitForWebSocketMessageType(context.socket!, 'nick-emoji.upsert');
    const createResponse = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/Alice`,
      { emoji: '🌙' },
    );
    assert.equal(createResponse.status, 200);
    assert.equal((createResponse.json.nickEmoji as { networkId: string }).networkId, network.id);
    assert.equal((createResponse.json.nickEmoji as { nick: string }).nick, 'Alice');
    assert.equal((createResponse.json.nickEmoji as { emoji: string }).emoji, '🌙');

    const upsertMessage = await upsertPromise as { nickEmoji: { id: string; nick: string; emoji: string } };
    assert.equal(upsertMessage.nickEmoji.nick, 'Alice');
    assert.equal(upsertMessage.nickEmoji.emoji, '🌙');

    const updateResponse = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/alice`,
      { emoji: '⭐' },
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((updateResponse.json.nickEmoji as { id: string }).id, upsertMessage.nickEmoji.id);
    assert.equal((updateResponse.json.nickEmoji as { emoji: string }).emoji, '⭐');

    const removePromise = waitForWebSocketMessageType(context.socket!, 'nick-emoji.remove');
    const clearResponse = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/ALICE`,
      { emoji: '' },
    );
    assert.equal(clearResponse.status, 200);
    assert.equal(clearResponse.json.nickEmoji, null);

    const removeMessage = await removePromise as { nickEmojiId: string };
    assert.equal(removeMessage.nickEmojiId, upsertMessage.nickEmoji.id);
    assert.deepEqual(context.storage.nickEmojis.list(network.id), []);
  } finally {
    await context.close();
  }
});

test('nick emoji routes validate payloads and targets', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());

  try {
    const invalidEmoji = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/Alice`,
      { emoji: 'ab' },
    );
    assert.equal(invalidEmoji.status, 400);
    assert.equal(invalidEmoji.json.message, 'Nick emoji must be one emoji');

    const missingEmojiPayload = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/Alice`,
      {},
    );
    assert.equal(missingEmojiPayload.status, 400);
    assert.equal(missingEmojiPayload.json.message, 'Invalid nick emoji payload');

    const tooLongNick = await requestJson(
      context.port,
      'PUT',
      `/api/networks/${encodeURIComponent(network.id)}/nick-emojis/${'x'.repeat(600)}`,
      { emoji: '🌙' },
    );
    assert.equal(tooLongNick.status, 400);
    assert.equal(tooLongNick.json.message, 'Nick is too long');

    const missingNetwork = await requestJson(
      context.port,
      'PUT',
      '/api/networks/missing-network/nick-emojis/Alice',
      { emoji: '🌙' },
    );
    assert.equal(missingNetwork.status, 404);
    assert.equal(missingNetwork.json.message, 'Network not found');
  } finally {
    await context.close();
  }
});
