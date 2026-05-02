import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ContactNotificationContact,
  ContactNotificationSettings,
} from '../web/src/contact-notifications/settings.js';
import {
  enableContactNotificationsAndUnmute,
  muteContactAndDisableNotifications,
  resolveContactRuleState,
} from '../web/src/contact-notifications/contact-rules.js';

const contact: ContactNotificationContact = {
  networkId: 'network-1',
  nick: 'MissD',
};

const makeSettings = (
  contacts: ContactNotificationContact[],
): ContactNotificationSettings => ({
  enabled: true,
  systemEnabled: false,
  sound: 'chirp',
  contacts,
});

test('query notifications are inactive while the selected PM nick is muted', () => {
  const settings = makeSettings([{ networkId: 'network-1', nick: 'missd' }]);

  assert.equal(resolveContactRuleState({
    networkId: contact.networkId,
    nick: contact.nick,
    friends: [],
    mutedNicks: [],
    contactNotifications: settings,
  }).notificationsEnabled, true);
  assert.equal(resolveContactRuleState({
    networkId: contact.networkId,
    nick: contact.nick,
    friends: [],
    mutedNicks: [{ id: 'mute-1', networkId: contact.networkId, nick: contact.nick }],
    contactNotifications: settings,
  }).notificationsEnabled, false);
});

test('muting a PM removes its notification contact after the mute succeeds', async () => {
  const removedContacts: ContactNotificationContact[] = [];

  const muted = await muteContactAndDisableNotifications({
    contact,
    addMutedNick: async (networkId, nick) => {
      assert.equal(networkId, 'network-1');
      assert.equal(nick, 'MissD');
      return true;
    },
    removeNotificationContact: (removedContact) => {
      removedContacts.push(removedContact);
    },
  });

  assert.equal(muted, true);
  assert.deepEqual(removedContacts, [contact]);
});

test('muting a PM keeps notifications unchanged when the mute fails', async () => {
  const removedContacts: ContactNotificationContact[] = [];

  const muted = await muteContactAndDisableNotifications({
    contact,
    addMutedNick: async () => false,
    removeNotificationContact: (removedContact) => {
      removedContacts.push(removedContact);
    },
  });

  assert.equal(muted, false);
  assert.deepEqual(removedContacts, []);
});

test('enabling PM notifications un-mutes the nick before adding the contact', async () => {
  const events: string[] = [];

  const enabled = await enableContactNotificationsAndUnmute({
    contact,
    mutedNick: { id: 'mute-1' },
    removeMutedNick: async (mutedNickId) => {
      events.push(`unmute:${mutedNickId}`);
      return true;
    },
    addNotificationContact: (addedContact) => {
      events.push(`add:${addedContact.networkId}:${addedContact.nick}`);
    },
    onNotificationsEnabled: () => {
      events.push('prime');
    },
  });

  assert.equal(enabled, true);
  assert.deepEqual(events, ['unmute:mute-1', 'add:network-1:MissD', 'prime']);
});

test('enabling PM notifications does not add the contact when unmute fails', async () => {
  const events: string[] = [];

  const enabled = await enableContactNotificationsAndUnmute({
    contact,
    mutedNick: { id: 'mute-1' },
    removeMutedNick: async (mutedNickId) => {
      events.push(`unmute:${mutedNickId}`);
      return false;
    },
    addNotificationContact: (addedContact) => {
      events.push(`add:${addedContact.networkId}:${addedContact.nick}`);
    },
    onNotificationsEnabled: () => {
      events.push('prime');
    },
  });

  assert.equal(enabled, false);
  assert.deepEqual(events, ['unmute:mute-1']);
});
