import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

test('message pin routes stay local, PM-only, and clear with transcript history', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  const network = context.storage.networks.upsert(createNetworkInput());
  const query = context.storage.conversations.upsertQuery(network.id, 'Alice');
  const channel = context.storage.conversations.upsertBuffer({
    networkId: network.id,
    kind: 'channel',
    target: '#help',
  });
  const received = context.storage.conversations.appendMessage({
    id: 'pin-received',
    networkId: network.id,
    target: 'Alice',
    nick: 'Alice',
    body: 'received message',
    kind: 'line',
    self: false,
    ts: 1,
  });
  const notice = context.storage.conversations.appendMessage({
    id: 'pin-notice',
    networkId: network.id,
    target: 'Alice',
    nick: 'server',
    body: 'not pinnable',
    kind: 'notice',
    self: false,
    ts: 2,
  });
  const sent = context.storage.conversations.appendMessage({
    id: 'pin-sent-action',
    networkId: network.id,
    target: 'Alice',
    nick: 'tester',
    body: 'waves',
    kind: 'action',
    self: true,
    ts: 3,
  });
  const channelMessage = context.storage.conversations.appendMessage({
    id: 'pin-channel',
    networkId: network.id,
    target: '#help',
    nick: 'Alice',
    body: 'channel message',
    kind: 'line',
    self: false,
    ts: 4,
  });

  try {
    const pinEventPromise = waitForWebSocketMessageType(context.socket!, 'message.pin.updated');
    const pinReceived = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${query.id}/messages/${received.id}/pin`,
      {},
    );
    assert.equal(pinReceived.status, 200);
    assert.equal((pinReceived.json.message as { pinnedAt?: number }).pinnedAt !== undefined, true);
    const pinEvent = await pinEventPromise as { message: { id: string; pinnedAt?: number } };
    assert.equal(pinEvent.message.id, received.id);
    assert.equal(pinEvent.message.pinnedAt !== undefined, true);

    const pinSent = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${query.id}/messages/${sent.id}/pin`,
      {},
    );
    assert.equal(pinSent.status, 200);

    const pins = await requestJson(context.port, 'GET', `/api/buffers/${query.id}/pins`);
    assert.deepEqual(
      (pins.json.messages as Array<{ id: string }>).map((message) => message.id),
      [received.id, sent.id],
    );

    const around = await requestJson(
      context.port,
      'GET',
      `/api/buffers/${query.id}/history/around/${received.id}`,
    );
    assert.equal(around.status, 200);
    assert.equal(around.json.targetMessageId, received.id);
    assert.deepEqual(
      (around.json.messages as Array<{ id: string }>).map((message) => message.id),
      [received.id, notice.id, sent.id],
    );

    const noticeAttempt = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${query.id}/messages/${notice.id}/pin`,
      {},
    );
    assert.equal(noticeAttempt.status, 400);
    assert.match(String(noticeAttempt.json.message), /text and action/);

    const channelAttempt = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${channel.id}/messages/${channelMessage.id}/pin`,
      {},
    );
    assert.equal(channelAttempt.status, 400);
    assert.match(String(channelAttempt.json.message), /private-message/);

    const unpinEventPromise = waitForWebSocketMessageType(context.socket!, 'message.pin.updated');
    const unpin = await requestJson(
      context.port,
      'DELETE',
      `/api/buffers/${query.id}/messages/${received.id}/pin`,
      {},
    );
    assert.equal(unpin.status, 200);
    const unpinEvent = await unpinEventPromise as { message: { id: string; pinnedAt?: number | null } };
    assert.equal(unpinEvent.message.id, received.id);
    assert.equal(unpinEvent.message.pinnedAt, undefined);

    const staleAround = await requestJson(
      context.port,
      'GET',
      `/api/buffers/${query.id}/history/around/${received.id}`,
    );
    assert.equal(staleAround.status, 404);

    const clear = await requestJson(context.port, 'DELETE', `/api/buffers/${query.id}/history`, {});
    assert.equal(clear.status, 200);
    const clearedPins = await requestJson(context.port, 'GET', `/api/buffers/${query.id}/pins`);
    assert.deepEqual(clearedPins.json.messages, []);
  } finally {
    await context.close();
  }
});
