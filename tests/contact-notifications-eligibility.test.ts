import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import {
  findEligibleContactNotificationBuffer,
  findEligibleContactNotificationSoundBuffer,
} from '../web/src/contact-notifications/settings.js';

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

test('eligible cue fires for allowed DM unread growth in another buffer', () => {
  const previousBuffers = new Map([['buffer-1', { unread: 0 }]]);
  const nextBuffer = makeBuffer({ unread: 1 });

  const eligible = findEligibleContactNotificationSoundBuffer({
    previousBuffers,
    nextBuffers: [nextBuffer],
    appVisibleAndFocused: true,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  });

  assert.equal(eligible?.id, nextBuffer.id);
});

test('eligible cue can match an identity contact after a nick change', () => {
  const previousBuffers = new Map([['buffer-1', { unread: 0 }]]);
  const nextBuffer = makeBuffer({ target: 'Alice_', unread: 1 });

  const eligible = findEligibleContactNotificationBuffer({
    previousBuffers,
    nextBuffers: [nextBuffer],
    messagesByConversation: {
      [nextBuffer.id]: [{
        id: 'message-1',
        bufferId: nextBuffer.id,
        networkId: nextBuffer.networkId,
        target: nextBuffer.target,
        nick: nextBuffer.target,
        senderIdentity: { kind: 'account', value: 'alice-account' },
        body: 'new nick',
        kind: 'line',
        self: false,
        ts: Date.now(),
      }],
    },
    appVisibleAndFocused: true,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{
        networkId: 'network-1',
        nick: 'Alice',
        identity: { kind: 'account', value: 'alice-account' },
      }],
    },
  });

  assert.equal(eligible?.id, nextBuffer.id);
});

test('eligible cue does not degrade strong identity contacts to nick matches', () => {
  const previousBuffers = new Map([['buffer-1', { unread: 0 }]]);
  const nextBuffer = makeBuffer({ unread: 1 });

  const eligible = findEligibleContactNotificationBuffer({
    previousBuffers,
    nextBuffers: [nextBuffer],
    messagesByConversation: {
      [nextBuffer.id]: [{
        id: 'message-1',
        bufferId: nextBuffer.id,
        networkId: nextBuffer.networkId,
        target: nextBuffer.target,
        nick: nextBuffer.target,
        senderIdentity: { kind: 'account', value: 'different-account' },
        body: 'same nick',
        kind: 'line',
        self: false,
        ts: Date.now(),
      }],
    },
    appVisibleAndFocused: true,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{
        networkId: 'network-1',
        nick: 'Alice',
        identity: { kind: 'account', value: 'alice-account' },
      }],
    },
  });

  assert.equal(eligible, null);
});

test('eligible cue ignores selected, disallowed, and wrong-network buffers', () => {
  const nextBuffer = makeBuffer({ unread: 1 });

  assert.equal(findEligibleContactNotificationSoundBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [nextBuffer],
    appVisibleAndFocused: true,
    selectedBufferId: nextBuffer.id,
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);

  assert.equal(findEligibleContactNotificationSoundBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [makeBuffer({ unread: 1, networkId: 'network-2' })],
    appVisibleAndFocused: true,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);

  assert.equal(findEligibleContactNotificationSoundBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [makeBuffer({ unread: 1, kind: 'channel', target: '#help' })],
    appVisibleAndFocused: true,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  }), null);
});

test('system notification eligibility still works when audio is disabled', () => {
  const previousBuffers = new Map([['buffer-1', { unread: 0 }]]);
  const nextBuffer = makeBuffer({ unread: 1 });

  const eligible = findEligibleContactNotificationBuffer({
    previousBuffers,
    nextBuffers: [nextBuffer],
    appVisibleAndFocused: false,
    selectedBufferId: 'buffer-2',
    settings: {
      enabled: false,
      systemEnabled: true,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  });

  assert.equal(eligible?.id, nextBuffer.id);
});

test('selected query buffer still qualifies when the app is not visible and focused', () => {
  const nextBuffer = makeBuffer({ unread: 1 });

  const eligible = findEligibleContactNotificationSoundBuffer({
    previousBuffers: new Map([['buffer-1', { unread: 0 }]]),
    nextBuffers: [nextBuffer],
    appVisibleAndFocused: false,
    selectedBufferId: nextBuffer.id,
    settings: {
      enabled: true,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [{ networkId: 'network-1', nick: 'alice' }],
    },
  });

  assert.equal(eligible?.id, nextBuffer.id);
});
