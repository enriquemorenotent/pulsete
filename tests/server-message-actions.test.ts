import assert from 'node:assert/strict';
import test from 'node:test';
import type { Action } from '../web/src/app-types.js';
import { dispatchInboundServerMessage } from '../web/src/server-message-actions.js';

test('server channel-list messages dispatch batched client actions', () => {
  const actions: Action[] = [];
  dispatchInboundServerMessage({
    type: 'channel.list.entries',
    networkId: 'network-1',
    requestId: 'request-1',
    entries: [{ name: '#help', users: 42, topic: 'Support' }],
  }, (action) => actions.push(action));
  dispatchInboundServerMessage({
    type: 'channel.list.completed',
    networkId: 'network-1',
    requestId: 'request-1',
    totalEntries: 1,
    truncated: false,
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [
    {
      type: 'channel-list-entries',
      networkId: 'network-1',
      requestId: 'request-1',
      entries: [{ name: '#help', users: 42, topic: 'Support' }],
    },
    {
      type: 'channel-list-completed',
      networkId: 'network-1',
      requestId: 'request-1',
      totalEntries: 1,
      truncated: false,
    },
  ]);
});

test('legacy single channel-list entry messages dispatch as one-entry batches', () => {
  const actions: Action[] = [];
  dispatchInboundServerMessage({
    type: 'channel.list.entry',
    networkId: 'network-1',
    requestId: 'request-1',
    entry: { name: '#help', users: 42, topic: 'Support' },
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [{
    type: 'channel-list-entries',
    networkId: 'network-1',
    requestId: 'request-1',
    entries: [{ name: '#help', users: 42, topic: 'Support' }],
  }]);
});
