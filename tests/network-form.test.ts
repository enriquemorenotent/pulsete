import assert from 'node:assert/strict';
import test from 'node:test';
import { toSaveNetworkPayload } from '../web/src/network-form.js';

test('network form omits hidden passwords when auth is set to none', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    nick2: 'tester_',
    nick3: 'tester__',
    username: 'tester',
    realName: 'Tester Example',
    authMethod: 'none',
    authTarget: 'NickServ',
    authAccount: 'account',
    password: 'hunter2',
    clearPassword: false,
    hasSavedPassword: true,
    favorite: false,
    autoJoin: '#chat',
    personaNote: '',
  });

  assert.equal(payload.password, undefined);
  assert.equal(payload.clearPassword, undefined);
  assert.equal(payload.authMethod, 'none');
  assert.equal(payload.authAccount, '');
});

test('network form includes the explicit auth account for sasl', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    nick2: 'tester_',
    nick3: 'tester__',
    username: 'ident',
    realName: 'Tester Example',
    authMethod: 'sasl-plain',
    authTarget: 'NickServ',
    authAccount: 'alice',
    password: 'hunter2',
    clearPassword: false,
    hasSavedPassword: false,
    favorite: false,
    autoJoin: '#chat',
    personaNote: '',
  });

  assert.equal(payload.authMethod, 'sasl-plain');
  assert.equal(payload.authAccount, 'alice');
});

test('network form preserves multiline persona notes and normalizes line endings', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    nick2: '',
    nick3: '',
    username: 'tester',
    realName: 'Tester Example',
    authMethod: 'none',
    authTarget: 'NickServ',
    authAccount: '',
    password: '',
    clearPassword: false,
    hasSavedPassword: false,
    favorite: false,
    autoJoin: '',
    personaNote: 'Line one\r\nLine two',
  });

  assert.equal(payload.personaNote, 'Line one\nLine two');
});
