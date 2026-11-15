import assert from 'node:assert/strict';
import test from 'node:test';
import { IrcConnection } from '../server/irc.js';
import { handleRuntimeEvent } from '../server/runtime-events.js';
import type { RuntimeEvent } from '../server/irc-types.js';
import { Storage, makeStorageFile } from './helpers/storage-test-helpers.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

const setup = (t: test.TestContext) => {
  const storage = new Storage(makeStorageFile());
  const network = storage.networks.upsert(createNetworkInput());
  const events: RuntimeEvent[] = [];
  const writes: string[] = [];
  storage.conversations.upsertBuffer({ networkId: network.id, target: 'server', kind: 'server' });
  const connection = new IrcConnection(network, { onEvent: event => {
    events.push(event);
    handleRuntimeEvent({ store: storage, publish() {} }, event);
  } });
  connection.lifecycle.connected = true;
  attachMockSocket(connection, createMockSocket(writes));
  t.after(() => { connection.dispose(); storage.close(); });
  const consume = (...lines: string[]) => lines.forEach(line => connection.consume(`${line}\r\n`));
  const statuses = () => events.filter(event => event.type === 'status');
  return { storage, network, connection, events, writes, consume, statuses };
};

const names = [
  ':irc.example 353 tester = #help :tester @alice',
  ':irc.example 366 tester #help :End of /NAMES list.',
];
const who = [
  ':irc.example 352 tester #help user host irc.example alice G :0 Alice Example',
  ':irc.example 315 tester #help :End of /WHO list.',
];
const topic = [
  ':irc.example 332 tester #help :Useful topic',
  ':irc.example 333 tester #help alice 123',
];

for (const awayNotify of [false, true]) test(`joining updates state silently with away-notify ${awayNotify}`, t => {
  const { storage, network, connection, consume, statuses, writes } = setup(t);
  if (awayNotify) connection.lifecycle.capabilities.negotiated.add('away-notify');
  connection.join('#help');
  consume(':tester!me@example JOIN :#help', ...topic, ...names);
  if (!awayNotify) consume(...who);
  assert.deepEqual(statuses(), []);
  const server = storage.conversations.getServerBuffer(network.id)!;
  assert.deepEqual(storage.conversations.listAllMessagesForBuffer(server.id), []);
  assert.equal(storage.conversations.getBuffer(server.id)!.unread, 0);
  assert.equal(storage.conversations.getChannelByName(network.id, '#help')?.topic, 'Useful topic');
  const alice = connection.getTrackedChannelUsers('#help').find(user => user.nick === 'alice')!;
  assert.equal(alice.mode, 'op');
  assert.equal(alice.away, !awayNotify);
  if (!awayNotify) assert.equal(alice.realname, 'Alice Example');
  assert.equal(writes.includes('WHO #help\r\n'), !awayNotify);
});

for (const joined of [false, true]) test(`requested results remain visible for ${joined ? 'joined' : 'unjoined'} channels`, t => {
  const { connection, consume, statuses } = setup(t);
  connection.lifecycle.capabilities.negotiated.add('away-notify');
  if (joined) { connection.join('#help'); consume(':tester!me@example JOIN :#help', ...topic, ...names); }
  connection.sendClientRaw('NAMES #help');
  consume(...names);
  connection.sendClientRaw('TOPIC #help');
  consume(...topic);
  connection.sendClientRaw('WHO #help');
  consume(...who);
  assert.deepEqual(statuses().map(event => event.message), [
    '* #help tester @alice', '* #help End of /NAMES list.',
    '* #help Useful topic', '* #help alice 123',
    '* #help user host irc.example alice G 0 Alice Example', '* #help End of /WHO list.',
  ]);
  assert.ok(statuses().every(event => event.target === 'server'));
});

test('background WHO and a subsequent manual WHO retain separate response streams', t => {
  const { connection, consume, statuses } = setup(t);
  connection.join('#help');
  consume(':tester!me@example JOIN :#help', ...names);
  connection.sendClientRaw('WHO #help');
  consume(...who);
  assert.deepEqual(statuses(), []);
  consume(...who);
  assert.equal(statuses().length, 2);
});

test('automatic roster repair does not swallow later manual NAMES requests', t => {
  const { connection, consume, statuses } = setup(t);
  connection.lifecycle.capabilities.negotiated.add('away-notify');
  connection.join('#help');
  consume(':tester!me@example JOIN :#help', ...names);
  consume(':op!user@host MODE #help +z mystery');
  connection.sendClientRaw('NAMES #help');
  consume(...names);
  assert.deepEqual(statuses(), []);
  consume(...names);
  assert.equal(statuses().length, 2);
  connection.sendClientRaw('NAMES #help');
  connection.sendClientRaw('NAMES #help');
  consume(...names, ...names);
  assert.equal(statuses().length, 6);
});

test('labeled manual WHO can finish before an earlier background WHO', t => {
  const { connection, consume, statuses, writes } = setup(t);
  connection.join('#help');
  consume(':tester!me@example JOIN :#help', ...names);
  connection.lifecycle.capabilities.negotiated.add('labeled-response');
  connection.sendClientRaw('WHO #help');
  const label = /^@label=(\S+)/.exec(writes.at(-1)!)![1];
  consume(...who.map(line => `@label=${label} ${line}`));
  assert.equal(statuses().length, 2);
  consume(...who);
  assert.equal(statuses().length, 2);
});

test('errors, unknown numeric replies and useful notices still reach the server tab', t => {
  const { storage, network, connection, consume, statuses } = setup(t);
  connection.sendClientRaw('WHO #missing');
  consume(':irc.example 403 tester #missing :No such channel',
    ':irc.example 799 tester :Server-specific information',
    ':irc.example NOTICE tester :Maintenance tonight');
  assert.equal(statuses().find(event => event.kind === 'error')?.message, '* #missing No such channel');
  assert.ok(statuses().some(event => event.message.includes('Server-specific information')));
  const server = storage.conversations.getServerBuffer(network.id)!;
  assert.ok(storage.conversations.listAllMessagesForBuffer(server.id).some(message => message.body.includes('Maintenance tonight')));
  assert.ok(storage.conversations.getBuffer(server.id)!.unread > 0);
});

test('missing join topics or optional topic metadata cannot swallow a later TOPIC result', t => {
  const { connection, consume, statuses } = setup(t);
  connection.lifecycle.capabilities.negotiated.add('away-notify');
  connection.join('#help');
  consume(':tester!me@example JOIN :#help', ...names);
  for (const text of ['First topic', 'Second topic']) {
    connection.sendClientRaw('TOPIC #help');
    consume(`:irc.example 332 tester #help :${text}`);
  }
  assert.deepEqual(statuses().map(event => event.message), ['* #help First topic', '* #help Second topic']);
  connection.sendClientRaw('TOPIC #help');
  consume(':irc.example 331 tester #help :No topic is set');
  assert.equal(statuses().at(-1)?.message, '* #help No topic is set');
});
