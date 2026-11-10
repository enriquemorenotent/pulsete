import { createRuntime } from '../server/runtime.js';
import { networkSchema } from '../shared/protocol-chat.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultIrcServerRules, IrcServerSupport, isServerChannel, modeArgument } from '../shared/irc-server-rules.js';
import { isSameIrcIdentifier } from '../shared/irc-identifiers.js';
import { IrcConnection } from '../server/irc.js';
import { handleIrcLine } from '../server/irc-handle-line.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import { attachMockSocket, createMockSocket } from './helpers/irc-test-socket-helpers.js';
import { Storage } from '../server/storage.js';
import { makeStorageFile } from './helpers/storage-test-helpers.js';
import { buildConversationIndex } from '../web/src/conversation-selectors.js';
import { createWhoisReplyContext } from '../server/irc-reply-context.js';
import { RuntimeFriendPresenceProjector } from '../server/runtime-friend-presence-projector.js';

const rulesFor = (...tokens: string[]) => {
  const support = new IrcServerSupport();
  support.update(['tester', ...tokens, 'are supported']);
  return support.rules;
};
const connectionFor = (...tokens: string[]) => {
  const connection = new IrcConnection(networkSchema.parse({ ...createNetworkInput(), id: 'net', hasPassword: false }), { onEvent() {} });
  handleIrcLine(connection, `:irc.example 005 tester ${tokens.join(' ')} :are supported`);
  return connection;
};

test('server support combines multiple replies, handles removals and resets between sessions', () => {
  const support = new IrcServerSupport();
  support.update(['me', 'CASEMAPPING=ascii', 'MONITOR=100', 'supported']);
  support.update(['me', 'PREFIX=(ov)!+', 'CHANMODES=beI,k,lL,imnpst', 'CHANTYPES=~', 'CHATHISTORY=25', 'supported']);
  assert.equal(support.rules.caseMapping, 'ascii');
  assert.equal(support.rules.monitor, 100);
  assert.equal(support.rules.historyLimit, 25);
  assert.equal(isServerChannel('~room', support.rules), true);
  assert.equal(isServerChannel('#room', support.rules), false);
  assert.equal(modeArgument('L', false, support.rules), false);
  assert.equal(modeArgument('L', true, support.rules), true);
  assert.equal(modeArgument('z', true, support.rules), null);
  support.update(['me', '-CASEMAPPING', '-MONITOR', 'CHANTYPES=', 'PREFIX=', 'supported']);
  assert.equal(support.rules.caseMapping, 'rfc1459');
  assert.equal(support.rules.monitor, null);
  assert.equal(isServerChannel('#room', support.rules), false);
  assert.equal(support.rules.prefixModes, '');
  support.reset();
  assert.equal(support.received, false);
  assert.deepEqual(support.rules, defaultIrcServerRules);
});

test('nickname comparisons distinguish all three mappings without folding Unicode', () => {
  assert.equal(isSameIrcIdentifier('Alice[', 'alice{', 'ascii'), false);
  assert.equal(isSameIrcIdentifier('Alice[', 'alice{', 'rfc1459'), true);
  assert.equal(isSameIrcIdentifier('Alice^', 'alice~', 'rfc1459-strict'), false);
  assert.equal(isSameIrcIdentifier('Alice[', 'alice{', 'rfc1459-strict'), true);
  assert.equal(isSameIrcIdentifier('Ä', 'ä', 'ascii'), false);
});

test('names and modes use advertised prefixes and argument groups per connection', () => {
  const connection = connectionFor('CASEMAPPING=ascii', 'CHANTYPES=~', 'PREFIX=(ov)!+', 'CHANMODES=b,k,L,imnpst');
  connection.channels.users.set('~room', []);
  handleIrcLine(connection, ':irc.example 353 tester = ~room :!Alice[ +Alice{');
  assert.deepEqual(connection.getTrackedChannelUsers('~room').map(u => [u.nick, u.mode]), [['Alice[', 'op'], ['Alice{', 'voice']]);
  handleIrcLine(connection, ':op!u@h MODE ~room -L+o Alice{');
  assert.equal(connection.getTrackedChannelUsers('~room').find(u => u.nick === 'Alice{')?.mode, 'op');
  handleIrcLine(connection, ':op!u@h MODE ~room +L-v 20 Alice{');
  assert.deepEqual(connection.getTrackedChannelUsers('~room').find(u => u.nick === 'Alice{')?.modes, ['op']);
  connection.dispose();
});

test('unknown mode arguments refresh the roster without applying guessed changes', () => {
  const connection = connectionFor();
  const writes: string[] = [];
  attachMockSocket(connection, createMockSocket(writes));
  connection.channels.users.set('#room', [{nick:'alice',mode:'normal',away:false}]);
  handleIrcLine(connection, ':op!u@h MODE #room +oz alice mystery');
  assert.equal(connection.getTrackedChannelUsers('#room')[0]?.mode, 'normal');
  assert.ok(writes.some(line => line.includes('NAMES #room')));
  connection.dispose();
});

test('reply matching does not consume another ASCII nickname reply', () => {
  const connection = connectionFor('CASEMAPPING=ascii');
  connection.replyTracker.queue(createWhoisReplyContext('server', 'Alice['));
  assert.equal(connection.replyTracker.consumeReplyContext('318', ['tester', 'Alice{', 'end'], 'irc.example'), null);
  assert.equal(connection.replyTracker.pendingReplyContexts.length, 1);
  assert.equal(connection.replyTracker.consumeReplyContext('318', ['tester', 'Alice[', 'end'], 'irc.example')?.kind, 'whois');
  connection.dispose();
});

test('stored routes and browser selection keep ASCII names distinct across restart and networks', () => {
  const path = makeStorageFile();
  let storage = new Storage(path);
  const ascii = storage.networks.upsert(createNetworkInput());
  const rfc = storage.networks.upsert(createNetworkInput({name:'Other'}));
  storage.networks.saveServerRules(ascii.id, rulesFor('CASEMAPPING=ascii'));
  const left = storage.conversations.upsertQuery(ascii.id, 'Alice[');
  const right = storage.conversations.upsertQuery(ascii.id, 'Alice{');
  assert.notEqual(left.id, right.id);
  const folded = storage.conversations.upsertQuery(rfc.id, 'Alice[');
  assert.equal(storage.conversations.upsertQuery(rfc.id, 'Alice{').id, folded.id);
  storage.close();
  storage = new Storage(path);
  try {
    assert.equal(storage.conversations.getBufferByTarget(ascii.id, 'alice[')?.id, left.id);
    assert.equal(storage.conversations.getBufferByTarget(ascii.id, 'alice{')?.id, right.id);
    const index = buildConversationIndex({buffers:storage.conversations.listBuffers(),channels:[],pendingChannels:[],networkStates:{
      [ascii.id]: {phase:'offline',serverName:null,nick:'me',serverRules:storage.networks.getServerRules(ascii.id)},
    }});
    assert.equal(index.findQueryBuffer(ascii.id,'ALICE[')?.id,left.id);
    assert.equal(index.findQueryBuffer(ascii.id,'ALICE{')?.id,right.id);
  } finally { storage.close(); }
});

test('changing comparison rules reindexes saved routes and refuses conflicting histories atomically', () => {
  const storage = new Storage(makeStorageFile());
  try {
    const network = storage.networks.upsert(createNetworkInput());
    const existing = storage.conversations.upsertQuery(network.id, 'Alice[');
    storage.networks.saveServerRules(network.id, rulesFor('CASEMAPPING=ascii'));
    assert.equal(storage.conversations.getBufferByTarget(network.id,'Alice[')?.id,existing.id);
    assert.equal(storage.conversations.getBufferByTarget(network.id,'Alice{'),null);
    const other = storage.conversations.upsertQuery(network.id,'Alice{');
    assert.throws(() => storage.networks.saveServerRules(network.id, defaultIrcServerRules), /conversations now conflict/);
    assert.equal(storage.networks.getServerRules(network.id).caseMapping,'ascii');
    assert.equal(storage.conversations.getBufferByTarget(network.id,'Alice[')?.id,existing.id);
    assert.equal(storage.conversations.getBufferByTarget(network.id,'Alice{')?.id,other.id);
  } finally { storage.close(); }
});

test('presence matching uses the mapping belonging to each network', () => {
  const projector = new RuntimeFriendPresenceProjector(networkId => networkId === 'ascii' ? rulesFor('CASEMAPPING=ascii') : defaultIrcServerRules);
  projector.project({type:'friend-presence',networkId:'ascii',presences:{'Alice[':'online'}},[],[]);
  const friends = [{id:'friend',nick:'Alice{'}] as Parameters<typeof projector.snapshot>[0];
  assert.equal(projector.snapshot(friends).friend,'offline');
  projector.project({type:'friend-presence',networkId:'rfc',presences:{'Alice[':'online'}},[],[]);
  assert.equal(projector.snapshot(friends).friend,'online');
});

test('runtime applies advertised rules before routing the following messages', () => {
  const storage = new Storage(makeStorageFile());
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput({workspaceOpen:true}));
  try {
    runtime.irc.sendRaw(network.id, 'PING test');
    const connection = runtime.connections.get(network.id)!;
    attachMockSocket(connection);
    connection.lifecycle.connected = true;
    connection.consume(':irc.example 005 tester CASEMAPPING=ascii CHANTYPES=~ :supported\r\n:Alice[ PRIVMSG tester :one\r\n:Alice{ PRIVMSG tester :two\r\n');
    const left = storage.conversations.getBufferByTarget(network.id,'Alice[')!;
    const right = storage.conversations.getBufferByTarget(network.id,'Alice{')!;
    assert.notEqual(left.id,right.id);
    assert.equal(runtime.gateway.snapshot().networkStates[network.id]?.serverRules?.caseMapping,'ascii');
    connection.channels.users.set('~room',[]);
    connection.consume(':alice!ident@host PRIVMSG ~room :custom channel\r\n');
    assert.equal(storage.conversations.getBufferByTarget(network.id,'~room')?.kind,'channel');
    connection.consume(':irc.example 005 tester CASEMAPPING=rfc1459 :supported\r\n:Alice{ PRIVMSG tester :must not route\r\n');
    assert.equal(connection.lifecycle.connected,false);
    assert.equal(storage.networks.getServerRules(network.id).caseMapping,'ascii');
    assert.equal(storage.conversations.listAllMessages(network.id,'Alice{').length,1);
  } finally { runtime.gateway.close(); storage.close(); }
});
