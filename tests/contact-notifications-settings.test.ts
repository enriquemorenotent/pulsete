import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addContactNotificationContact,
  canPlayContactNotificationCue,
  parseContactNotificationSettings,
  serializeContactNotificationSettings,
} from '../web/src/contact-notifications/settings.js';

test('stored settings ignore invalid payloads', () => {
  assert.deepEqual(parseContactNotificationSettings(null), {
    enabled: false,
    systemEnabled: false,
    sound: 'chirp',
    contacts: [],
  });
  assert.deepEqual(parseContactNotificationSettings('{"enabled":true,"contacts":[{"networkId":1}]}'), {
    enabled: true,
    systemEnabled: false,
    sound: 'chirp',
    contacts: [],
  });
});

test('stored settings fall back to the default sound when the payload is invalid', () => {
  assert.deepEqual(parseContactNotificationSettings('{"enabled":true,"sound":"gong","contacts":[]}'), {
    enabled: true,
    systemEnabled: false,
    sound: 'chirp',
    contacts: [],
  });
});

test('adding contacts dedupes by network and IRC case-folded nick', () => {
  const settings = addContactNotificationContact({
    enabled: true,
    systemEnabled: false,
    sound: 'glass',
    contacts: [{ networkId: 'network-1', nick: 'Alice' }],
  }, {
    networkId: 'network-1',
    nick: 'ALICE',
  });

  assert.deepEqual(settings, {
    enabled: true,
    systemEnabled: false,
    sound: 'glass',
    contacts: [{ identity: { kind: 'nick', value: 'alice' }, networkId: 'network-1', nick: 'Alice' }],
  });
});

test('serializing settings preserves the chosen sound', () => {
  assert.equal(
    serializeContactNotificationSettings({
      enabled: true,
      systemEnabled: true,
      sound: 'bell',
      contacts: [{ networkId: 'network-1', nick: 'Alice' }],
    }),
    '{"enabled":true,"systemEnabled":true,"sound":"bell","contacts":[{"identity":{"kind":"nick","value":"alice"},"networkId":"network-1","nick":"Alice"}]}',
  );
});

test('cooldown blocks repeated cues inside the throttle window', () => {
  assert.equal(canPlayContactNotificationCue(1_500, 500), true);
  assert.equal(canPlayContactNotificationCue(1_499, 500), false);
});
