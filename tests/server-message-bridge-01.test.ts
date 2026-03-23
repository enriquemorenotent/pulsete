import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action } from '../web/src/app-types.js';
import { createServerMessageBridge } from '../web/src/server-message-bridge.js';

test('server message bridge suppresses websocket echoes for mutation messages', () => {
  const dispatched: Action[] = [];
  const bridge = createServerMessageBridge((action) => {
    dispatched.push(action);
  });
  const message = { type: 'network.remove', networkId: 'network-1' } as const;

  bridge.applyMutationMessages([message]);
  bridge.applySocketMessage(message);

  assert.deepEqual(dispatched, [{ type: 'remove-network', networkId: 'network-1' }]);
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
