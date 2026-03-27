import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol.js';
import {
  addBackgroundDmAudioContact,
  canPlayBackgroundDmAudioCue,
  findEligibleBackgroundDmAudioBuffer,
  parseBackgroundDmAudioSettings,
  serializeBackgroundDmAudioSettings,
} from '../web/src/background-dm-audio.js';

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'query',
  target: overrides.target ?? 'Alice',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

test('stored settings ignore invalid payloads', () => {
  assert.deepEqual(parseBackgroundDmAudioSettings(null), {
    enabled: false,
    sound: 'chirp',
    contacts: [],
  });
  assert.deepEqual(parseBackgroundDmAudioSettings('{"enabled":true,"contacts":[{"networkId":1}]}'), {
    enabled: true,
    sound: 'chirp',
    contacts: [],
  });
});

test('stored settings fall back to the default sound when the payload is invalid', () => {
  assert.deepEqual(parseBackgroundDmAudioSettings('{"enabled":true,"sound":"gong","contacts":[]}'), {
    enabled: true,
    sound: 'chirp',
    contacts: [],
  });
});

test('adding contacts dedupes by network and IRC case-folded nick', () => {
  const settings = addBackgroundDmAudioContact({
    enabled: true,
    sound: 'glass',
    contacts: [{ networkId: 'network-1', nick: 'Alice' }],
  }, {
    networkId: 'network-1',
    nick: 'ALICE',
  });

  assert.deepEqual(settings, {
    enabled: true,
    sound: 'glass',
    contacts: [{ networkId: 'network-1', nick: 'Alice' }],
  });
});

test('serializing settings preserves the chosen sound', () => {
  assert.equal(
    serializeBackgroundDmAudioSettings({
      enabled: true,
      sound: 'bell',
      contacts: [{ networkId: 'network-1', nick: 'Alice' }],
    }),
    '{"enabled":true,"sound":"bell","contacts":[{"networkId":"network-1","nick":"Alice"}]}',
  );
});

test('eligible cue fires for allowed DM unread growth in another buffer', () => {
  const previousBuffers = new Map([['buffer-1', { unread: 0 }]]);
  const nextBuffer = makeBuffer({ unread: 1 });

  const eligible = findEligibleBackgroundDmAudioBuffer({
    previousBuffers,
    nextBuffers: [nextBuffer],
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  });

  assert.equal(eligible?.id, nextBuffer.id);
});

test('eligible cue ignores selected, disallowed, and wrong-network buffers', () => {
  const nextBuffer = makeBuffer({ unread: 1 });

  assert.equal(findEligibleBackgroundDmAudioBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [nextBuffer],
    selectedBufferId: nextBuffer.id,
    settings: {
      enabled: true,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);

  assert.equal(findEligibleBackgroundDmAudioBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [makeBuffer({ unread: 1, networkId: 'network-2' })],
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);

  assert.equal(findEligibleBackgroundDmAudioBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [makeBuffer({ unread: 1, kind: 'channel', target: '#help' })],
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);
});

test('cooldown blocks repeated cues inside the throttle window', () => {
  assert.equal(canPlayBackgroundDmAudioCue(1_500, 500), true);
  assert.equal(canPlayBackgroundDmAudioCue(1_499, 500), false);
});
