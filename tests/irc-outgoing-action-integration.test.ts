import assert from 'node:assert/strict';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import type { RuntimeEvent } from '../server/irc-types.js';

const setup = () => {
  const events: RuntimeEvent[] = [];
  const connection = new IrcConnection({
    id: 'network', workspaceOpen: false, name: 'Test', host: 'irc.test', port: 6667,
    tls: false, nick: 'tester', altNicks: [], realName: 'Test', hasPassword: false,
    favorite: false, autoJoin: [],
  }, { onEvent: event => events.push(event) });
  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket());
  return { connection, events };
};

test('joins and lists use the shared deadline owner and retain their feature cleanup', () => {
  const { connection, events } = setup();
  connection.join('#room', 'server', { visiblePending: true });
  connection.requestChannelList('list-1');
  const join = connection.getChannelSession('#room')!.joinAction!;
  const list = connection.channelList.action!;
  connection.replyTracker.actions.expire(Math.max(join.deadline, list.deadline));
  assert.equal(join.state, 'unknown');
  assert.equal(list.state, 'unknown');
  assert.equal(connection.getChannelSession('#room'), null);
  assert.equal(connection.channelList.session.phase, 'draining');
  assert.ok(events.some(event => event.type === 'channel-list-failed'));
  connection.dispose();
});

test('positive channel and list replies confirm actions instead of letting their timers expire', () => {
  const { connection } = setup();
  connection.join('#room');
  const join = connection.getChannelSession('#room')!.joinAction!;
  connection.consume(':tester!u@host JOIN #room\r\n');
  assert.equal(join.state, 'confirmed');
  connection.requestChannelList('list-1');
  const list = connection.channelList.action!;
  connection.consume(':server 323 tester :End of LIST\r\n');
  assert.equal(list.state, 'confirmed');
  connection.replyTracker.actions.expire(Date.now() + 120_000);
  assert.equal(connection.getChannelSession('#room')?.phase, 'joined');
  connection.dispose();
});

test('disconnect makes outstanding joins and lists unknown and clears their feature state', () => {
  const { connection } = setup();
  connection.join('#room');
  connection.requestChannelList('list-1');
  const join = connection.getChannelSession('#room')!.joinAction!;
  const list = connection.channelList.action!;
  connection.resetTransientState();
  assert.equal(join.state, 'unknown');
  assert.equal(list.state, 'unknown');
  assert.equal(connection.channelList.session.phase, 'idle');
  assert.equal(connection.getChannelSession('#room'), null);
  connection.dispose();
});

test('late labeled rejection still emits rollback and draft recovery for the correct message', () => {
  const { connection, events } = setup();
  connection.lifecycle.capabilities.negotiated.add('labeled-response');
  connection.say('alice', 'hello');
  const context = connection.replyTracker.pendingReplyContexts[0]!;
  assert.equal(context.kind, 'message');
  connection.replyTracker.actions.expire(context.expiresAt);
  connection.consume(`@label=${context.label} :server 401 tester alice :No such nick\r\n`);
  assert.equal(context.action?.state, 'failed');
  const failure = events.find(event => event.type === 'send-failed');
  assert.ok(failure && failure.type === 'send-failed');
  assert.equal(failure.retryDraft, 'hello');
  assert.ok(failure.rollbackMessageId);
  connection.dispose();
});

test('labeled ACK and self echo settle outgoing messages', () => {
  const { connection } = setup();
  connection.lifecycle.capabilities.negotiated.add('labeled-response');
  connection.lifecycle.capabilities.negotiated.add('echo-message');
  connection.say('alice', 'hello');
  const first = connection.replyTracker.pendingReplyContexts[0]!;
  connection.consume(`@label=${first.label} :server ACK\r\n`);
  assert.equal(first.action?.state, 'confirmed');
  connection.say('alice', 'again');
  const second = connection.replyTracker.pendingReplyContexts[0]!;
  connection.consume(`@label=${second.label} :tester!u@host PRIVMSG alice :again\r\n`);
  assert.equal(second.action?.state, 'confirmed');
  assert.equal(connection.replyTracker.pendingReplyContexts.length, 0);
  connection.dispose();
});
