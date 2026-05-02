import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContactRuleState } from '../web/src/contact-notifications/contact-rules.js';

test('contact rule state masks notification contacts while the nick is muted', () => {
  const state = resolveContactRuleState({
    networkId: 'network-1',
    nick: 'Alice',
    friends: [{ id: 'friend-1', nick: 'alice' }],
    mutedNicks: [{ id: 'mute-1', networkId: 'network-1', nick: 'ALICE' }],
    contactNotifications: {
      contacts: [{ networkId: 'network-1', nick: 'aLiCe' }],
    },
  });

  assert.deepEqual(state.contact, { networkId: 'network-1', nick: 'Alice' });
  assert.equal(state.friend?.id, 'friend-1');
  assert.equal(state.mutedNick?.id, 'mute-1');
  assert.equal(state.notificationsEnabled, false);
});

test('contact rule state combines friend and notification lists when the nick is not muted', () => {
  const state = resolveContactRuleState({
    networkId: 'network-1',
    nick: 'Alice',
    friends: [{ id: 'friend-1', nick: 'alice' }],
    mutedNicks: [],
    contactNotifications: {
      contacts: [{ networkId: 'network-1', nick: 'aLiCe' }],
    },
  });

  assert.deepEqual(state.contact, { networkId: 'network-1', nick: 'Alice' });
  assert.equal(state.friend?.id, 'friend-1');
  assert.equal(state.mutedNick, null);
  assert.equal(state.notificationsEnabled, true);
});

test('contact rule state keeps notification and mute matches scoped to the network', () => {
  const state = resolveContactRuleState({
    networkId: 'network-1',
    nick: 'Alice',
    friends: [],
    mutedNicks: [{ id: 'mute-1', networkId: 'network-2', nick: 'Alice' }],
    contactNotifications: {
      contacts: [{ networkId: 'network-2', nick: 'Alice' }],
    },
  });

  assert.equal(state.friend, null);
  assert.equal(state.mutedNick, null);
  assert.equal(state.notificationsEnabled, false);
});
