import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesIdentityScopedEntry,
  resolveNetworkUserIdentity,
} from '../shared/user-identity.js';

test('network user identity resolves account, then userhost, then nick', () => {
  assert.deepEqual(resolveNetworkUserIdentity({
    account: 'Alice',
    host: 'host.example',
    nick: 'Guest',
    username: 'user',
  }), { kind: 'account', value: 'alice' });
  assert.deepEqual(resolveNetworkUserIdentity({
    account: '*',
    host: 'HOST.Example',
    nick: 'Guest',
    username: 'User',
  }), { kind: 'userhost', value: 'user@host.example' });
  assert.deepEqual(resolveNetworkUserIdentity({
    nick: 'Guest^',
  }), { kind: 'nick', value: 'guest~' });
});

test('identity scoped entries match strong identities without degrading to nick', () => {
  const accountEntry = {
    networkId: 'network-1',
    nick: 'Alice',
    identity: { kind: 'account' as const, value: 'alice' },
  };
  assert.equal(matchesIdentityScopedEntry(accountEntry, {
    networkId: 'network-1',
    nick: 'Alice_',
    identity: { kind: 'account', value: 'alice' },
  }), true);
  assert.equal(matchesIdentityScopedEntry(accountEntry, {
    networkId: 'network-1',
    nick: 'Alice',
    identity: { kind: 'nick', value: 'alice' },
  }), false);
});

test('nick fallback entries keep legacy behavior', () => {
  const nickEntry = {
    networkId: 'network-1',
    nick: 'Alice',
    identity: { kind: 'nick' as const, value: 'alice' },
  };
  assert.equal(matchesIdentityScopedEntry(nickEntry, {
    networkId: 'network-1',
    nick: 'ALICE',
    identity: { kind: 'account', value: 'someone-else' },
  }), true);
});
