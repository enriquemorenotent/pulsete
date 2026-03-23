import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action } from '../web/src/app-types.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';

test('server message bridge suppresses websocket echoes with matching mutation ids', () => {
  const dispatched: Action[] = [];
  const bridge = createServerMessageBridge((action) => {
    dispatched.push(action);
  });
  const message = { type: 'network.remove', networkId: 'network-1', mutationId: 'mutation-1' } as const;

  bridge.applyMutationMessages([message]);
  bridge.applySocketMessage(message);

  assert.deepEqual(dispatched, [{ type: 'remove-network', networkId: 'network-1' }]);
});

test('server message bridge suppresses all websocket echoes from the same mutation', () => {
  const dispatched: Action[] = [];
  const bridge = createServerMessageBridge((action) => {
    dispatched.push(action);
  });
  const messages = [
    { type: 'friend.remove', friendId: 'friend-1', mutationId: 'mutation-1' },
    { type: 'notice', networkId: 'network-1', message: 'saved', mutationId: 'mutation-1' },
  ] as const;

  bridge.applyMutationMessages(messages);
  bridge.applySocketMessage(messages[0]);
  bridge.applySocketMessage(messages[1]);

  assert.deepEqual(dispatched, [
    { type: 'remove-friend', friendId: 'friend-1' },
    { type: 'set-banner', banner: { kind: 'notice', message: 'saved' } },
  ]);
});

test('server message bridge forwards distinct websocket messages after a mutation', () => {
  const dispatched: Action[] = [];
  const bridge = createServerMessageBridge((action) => {
    dispatched.push(action);
  });

  bridge.applyMutationMessages([{ type: 'friend.remove', friendId: 'friend-1' }]);
  bridge.applySocketMessage({ type: 'network.remove', networkId: 'network-1' });

  assert.deepEqual(dispatched, [
    { type: 'remove-friend', friendId: 'friend-1' },
    { type: 'remove-network', networkId: 'network-1' },
  ]);
});
