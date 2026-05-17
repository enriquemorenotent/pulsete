import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol-chat.js';
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

test('network state messages dispatch runtime capabilities', () => {
  const actions: Action[] = [];
  dispatchInboundServerMessage({
    type: 'network.state',
    networkId: 'network-1',
    phase: 'connecting',
    serverName: null,
    nick: 'tester',
    capabilities: {
      offered: ['account-tag', 'echo-message'],
      negotiated: ['echo-message'],
      pending: ['userhost-in-names'],
    },
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [{
    type: 'network-state',
    networkId: 'network-1',
    phase: 'connecting',
    serverName: null,
    nick: 'tester',
    capabilities: {
      offered: ['account-tag', 'echo-message'],
      negotiated: ['echo-message'],
      pending: ['userhost-in-names'],
    },
  }]);
});

test('server connection issue notices stay in the server transcript only', () => {
  const actions: Action[] = [];
  const message = createMessage({
    kind: 'notice',
    nick: 'OperServ',
    body: 'The session limit for your IP 2001:db8::1 has been exceeded.',
  });
  dispatchInboundServerMessage({
    type: 'message.append',
    message,
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [{ type: 'append-message', message }]);
});

test('routine server notices stay in the transcript only', () => {
  const actions: Action[] = [];
  dispatchInboundServerMessage({
    type: 'message.append',
    message: createMessage({
      kind: 'notice',
      nick: 'irc.example',
      body: 'Looking up your hostname...',
    }),
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [{
    type: 'append-message',
    message: createMessage({
      kind: 'notice',
      nick: 'irc.example',
      body: 'Looking up your hostname...',
    }),
  }]);
});

test('server error messages stay in the server transcript only', () => {
  const actions: Action[] = [];
  const message = createMessage({
    kind: 'error',
    nick: null,
    body: 'Unable to connect to irc.example:6697 (Connection closed)',
  });
  dispatchInboundServerMessage({
    type: 'message.append',
    message,
  }, (action) => actions.push(action));

  assert.deepEqual(actions, [{ type: 'append-message', message }]);
});

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'message-1',
  bufferId: 'buffer-1',
  networkId: 'network-1',
  target: 'server',
  nick: null,
  body: 'message body',
  kind: 'system',
  self: false,
  ts: 1,
  ...overrides,
});
