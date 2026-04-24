import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import {
  waitForWebSocketMessage,
  waitForWebSocketMessageType,
} from './helpers/http-websocket-test-helpers.js';

test('friend routes persist entries and broadcast updates without auth', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  const network = context.storage.networks.upsert(createNetworkInput());

  try {
    const addMessagePromise = waitForWebSocketMessageType(context.socket!, 'friend.upsert');
    const presenceMessagePromise = waitForWebSocketMessageType(context.socket!, 'friend.presence');
    const createResponse = await requestJson(context.port, 'POST', '/api/friends', { nick: 'Alice' });
    assert.equal(createResponse.status, 200);
    assert.equal((createResponse.json.friend as { nick: string }).nick, 'Alice');

    const addMessage = await addMessagePromise as { friend: { id: string; nick: string } };
    assert.equal(addMessage.friend.nick, 'Alice');
    const presenceMessage = await presenceMessagePromise as { friendId: string; presence: string };
    assert.equal(presenceMessage.friendId, addMessage.friend.id);
    assert.equal(presenceMessage.presence, 'offline');

    const duplicateResponse = await requestJson(context.port, 'POST', '/api/friends', { nick: 'alice' });
    assert.equal(duplicateResponse.status, 200);
    assert.equal((duplicateResponse.json.friend as { id: string }).id, addMessage.friend.id);
    assert.equal(context.storage.conversations.upsertQuery(network.id, 'Alice').target, 'Alice');

    const removeMessagePromise = waitForWebSocketMessageType(context.socket!, 'friend.remove');
    const deleteResponse = await requestJson(context.port, 'DELETE', `/api/friends/${addMessage.friend.id}`);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.json.ok, true);

    const removeMessage = await removeMessagePromise as { friendId: string };
    assert.equal(removeMessage.friendId, addMessage.friend.id);
    assert.equal(context.storage.friends.list().length, 0);
  } finally {
    await context.close();
  }
});

test('friend routes validate payloads and targets', async () => {
  const context = await createHttpRuntimeContext();

  try {
    const invalidPayload = await requestJson(context.port, 'POST', '/api/friends', { nick: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid friend payload');

    const invalidTarget = await requestJson(context.port, 'POST', '/api/friends', { nick: '#help' });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(context.port, 'POST', '/api/friends', { nick: 'Server' });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(context.port, 'POST', '/api/friends', { nick: 'alice,bob' });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const tooLongNick = await requestJson(context.port, 'POST', '/api/friends', { nick: 'x'.repeat(600) });
    assert.equal(tooLongNick.status, 400);
    assert.equal(tooLongNick.json.message, 'Friend nick is too long');

    const missingDelete = await requestJson(context.port, 'DELETE', '/api/friends/missing-friend');
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.json.message, 'Friend not found');
  } finally {
    await context.close();
  }
});

test('muted nick routes persist entries, recompute unread, and broadcast updates without auth', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  const network = context.storage.networks.upsert(createNetworkInput({
    nick: 'tester',
    altNicks: ['tester_'],
  }));
  const channel = context.storage.conversations.upsertChannel({ networkId: network.id, name: '#help' });
  handleRuntimeEvent({ store: context.storage, publish: context.runtime.gateway.publish }, {
    type: 'message',
    message: {
      id: 'msg-1',
      networkId: network.id,
      target: '#help',
      nick: 'Alice',
      body: 'hello tester',
      kind: 'line',
      self: false,
      ts: Date.now(),
    },
  });

  try {
    const mutedPromise = waitForWebSocketMessageType(context.socket!, 'muted-nick.upsert');
    const mutedBufferPromise = waitForWebSocketMessage(
      context.socket!,
      (message: Record<string, unknown>) =>
        message.type === 'buffer.upsert'
        && (message.buffer as { id?: string; unread?: number } | undefined)?.id === channel.id
        && (message.buffer as { unread?: number } | undefined)?.unread === 0,
      'muted buffer recompute',
    );
    const createResponse = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: network.id,
      nick: 'alice',
    });
    assert.equal(createResponse.status, 200);
    assert.equal((createResponse.json.mutedNick as { nick: string }).nick, 'alice');

    const mutedMessage = await mutedPromise as { mutedNick: { id: string; nick: string } };
    assert.equal(mutedMessage.mutedNick.nick, 'alice');
    await mutedBufferPromise;
    assert.equal(context.storage.conversations.getBuffer(channel.id)?.unread, 0);
    assert.equal(context.storage.conversations.getBuffer(channel.id)?.priorityUnread, 0);

    const duplicateResponse = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: network.id,
      nick: 'ALICE',
    });
    assert.equal(duplicateResponse.status, 200);
    assert.equal((duplicateResponse.json.mutedNick as { id: string }).id, mutedMessage.mutedNick.id);

    const removePromise = waitForWebSocketMessageType(context.socket!, 'muted-nick.remove');
    const restoredBufferPromise = waitForWebSocketMessage(
      context.socket!,
      (message: Record<string, unknown>) =>
        message.type === 'buffer.upsert'
        && (message.buffer as { id?: string; unread?: number; priorityUnread?: number } | undefined)?.id === channel.id
        && (message.buffer as { unread?: number } | undefined)?.unread === 1
        && (message.buffer as { priorityUnread?: number } | undefined)?.priorityUnread === 1,
      'restored buffer recompute',
    );
    const deleteResponse = await requestJson(context.port, 'DELETE', `/api/muted-nicks/${mutedMessage.mutedNick.id}`);
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.json.ok, true);

    const removeMessage = await removePromise as { mutedNickId: string };
    assert.equal(removeMessage.mutedNickId, mutedMessage.mutedNick.id);
    await restoredBufferPromise;
    assert.equal(context.storage.conversations.getBuffer(channel.id)?.unread, 1);
    assert.equal(context.storage.conversations.getBuffer(channel.id)?.priorityUnread, 1);
  } finally {
    await context.close();
  }
});

test('muted nick routes validate payloads, networks, and targets', async () => {
  const context = await createHttpRuntimeContext();
  const network = context.storage.networks.upsert(createNetworkInput());

  try {
    const invalidPayload = await requestJson(context.port, 'POST', '/api/muted-nicks', { nick: {} });
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.json.message, 'Invalid muted nick payload');

    const missingNetwork = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: 'missing-network',
      nick: 'alice',
    });
    assert.equal(missingNetwork.status, 404);
    assert.equal(missingNetwork.json.message, 'Network not found');

    const invalidTarget = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: network.id,
      nick: '#help',
    });
    assert.equal(invalidTarget.status, 400);
    assert.equal(invalidTarget.json.message, 'Private-message target is required');

    const reservedTarget = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: network.id,
      nick: 'Server',
    });
    assert.equal(reservedTarget.status, 400);
    assert.equal(reservedTarget.json.message, 'Private-message target is required');

    const multipleTargets = await requestJson(context.port, 'POST', '/api/muted-nicks', {
      networkId: network.id,
      nick: 'alice,bob',
    });
    assert.equal(multipleTargets.status, 400);
    assert.equal(multipleTargets.json.message, 'Private-message target must refer to a single nick');

    const missingDelete = await requestJson(context.port, 'DELETE', '/api/muted-nicks/missing-muted-nick');
    assert.equal(missingDelete.status, 404);
    assert.equal(missingDelete.json.message, 'Muted nick not found');
  } finally {
    await context.close();
  }
});
