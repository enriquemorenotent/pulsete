import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRegistrationLines } from '../server/irc-auth.js';
import { IrcConnection } from '../server/irc.js';
import { createMockSocket, mockNetConnect } from './helpers/irc-race-test-helpers.js';
import { findIdentityMatches } from '../web/src/network-identity-warnings.js';
import type { NetworkProfile } from '../shared/protocol-chat.js';

const profile = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: 'a', workspaceOpen: true, name: 'Private connection label', host: 'irc.example.org', port: 6697,
  tls: true, nick: 'alice', altNicks: [], realName: '', hasPassword: false, favorite: false, autoJoin: [], ...overrides,
});

test('registration never substitutes the private label for a blank real name', () => {
  for (const realName of ['', '   ', '\t']) {
    const lines = buildRegistrationLines(profile({realName}));
    assert.ok(lines.includes('USER alice 0 * :IRC user'));
    assert.ok(lines.every(line => !line.includes('Private connection label')));
  }
  assert.ok(buildRegistrationLines(profile({realName:'  Explicit Name  '})).includes('USER alice 0 * :  Explicit Name  '));
});

test('renaming a private connection while connecting does not restart its handshake', () => {
  const writes: string[] = [];
  const socket = createMockSocket(writes);
  let calls = 0;
  const restore = mockNetConnect(() => { calls++; return socket; });
  const connection = new IrcConnection(profile({tls:false,port:6667}), {onEvent:()=>{}});
  try {
    connection.connect();
    connection.updateProfile(profile({tls:false,port:6667,name:'Different private label'}));
    assert.equal(calls, 1);
    socket.emit('connect');
    assert.ok(writes.some(line => line.includes('USER alice 0 * :IRC user')));
  } finally { connection.disconnect(); restore(); }
});

test('warnings compare transmitted idents, explicit real names, and IRC login accounts', () => {
  const current = profile({username:'shared{D}',realName:'Shared Name',authMethod:'sasl-plain',authAccount:'SharedLogin'});
  const other = profile({id:'b',name:'Other account',host:'IRC.EXAMPLE.ORG.',port:6667,tls:false,username:'sharedD',realName:'Shared Name',authMethod:'nickserv',authAccount:'sharedlogin'});
  assert.deepEqual(findIdentityMatches(current, [current, other]), [{id:'b',name:'Other account',fields:['username / ident','real name','IRC login account']}]);
  assert.equal(current.username, 'shared{D}');
});

test('blank neutral real names and unrelated servers do not create warnings', () => {
  const current=profile();
  assert.deepEqual(findIdentityMatches(current,[profile({id:'b',nick:'bob'}),profile({id:'c',host:'other.example.org'})]),[]);
  assert.deepEqual(findIdentityMatches({...current,host:''},[profile({id:'b'})]),[]);
});

test('fallback nick identities are checked but server passwords are not login accounts', () => {
  assert.deepEqual(findIdentityMatches(profile({authMethod:'sasl-plain'}),[profile({id:'b',nick:'bob',username:'alice',authMethod:'nickserv',authAccount:'alice'})])[0]?.fields,['username / ident','IRC login account']);
  assert.deepEqual(findIdentityMatches(profile({authMethod:'server-pass',authAccount:'shared'}),[profile({id:'b',nick:'bob',authMethod:'server-pass',authAccount:'shared'})]),[]);
});
