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
    username: 'uid309962',
    nick2: 'tester_',
    nick3: 'tester__',
    realName: 'Tester Example',
    authMethod: 'none',
    authTarget: 'NickServ',
    authAccount: 'account',
    password: 'hunter2',
    clearPassword: false,
    hasSavedPassword: true,
    favorite: false,
    autoJoin: '#chat',
    notes: 'Character: Mira',
  });

  assert.equal(payload.password, undefined);
  assert.equal(payload.clearPassword, undefined);
  assert.equal(payload.authMethod, 'none');
  assert.equal(payload.authAccount, '');
  assert.equal(payload.username, 'uid309962');
  assert.equal(payload.notes, 'Character: Mira');
});

test('network form omits blank username identities', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    username: '   ',
    nick2: '',
    nick3: '',
    realName: '',
    authMethod: 'none',
    authTarget: 'NickServ',
    authAccount: '',
    password: '',
    clearPassword: false,
    hasSavedPassword: false,
    favorite: false,
    autoJoin: '',
    notes: '',
  });

  assert.equal(payload.username, undefined);
});

test('network form includes the explicit auth account for sasl', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    username: '',
    nick2: 'tester_',
    nick3: 'tester__',
    realName: 'Tester Example',
    authMethod: 'sasl-plain',
    authTarget: 'NickServ',
    authAccount: 'alice',
    password: 'hunter2',
    clearPassword: false,
    hasSavedPassword: false,
    favorite: false,
    autoJoin: '#chat',
    notes: '',
  });

  assert.equal(payload.authMethod, 'sasl-plain');
  assert.equal(payload.authAccount, 'alice');
});

test('network form preserves exact passwords for password-based auth methods', () => {
  const payload = toSaveNetworkPayload({
    id: 'network-1',
    name: 'TestNet',
    host: 'irc.example.test',
    port: '6667',
    tls: false,
    nick: 'tester',
    username: '',
    nick2: 'tester_',
    nick3: 'tester__',
    realName: 'Tester Example',
    authMethod: 'sasl-plain',
    authTarget: 'NickServ',
    authAccount: 'alice',
    password: ' secret pass ',
    clearPassword: false,
    hasSavedPassword: false,
    favorite: false,
    autoJoin: '#chat',
    notes: '',
  });

  assert.equal(payload.password, ' secret pass ');
});
