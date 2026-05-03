import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState } from '../shared/protocol-chat.js';
import {
  addContactNotificationContact,
  canPlayContactNotificationCue,
  findEligibleContactNotificationBuffer,
  findEligibleContactNotificationSoundBuffer,
  parseContactNotificationSettings,
  serializeContactNotificationSettings,
} from '../web/src/contact-notifications/settings.js';
import { createContactSystemNotification } from '../web/src/contact-notifications/system-notification.js';

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
    contacts: [{ networkId: 'network-1', nick: 'Alice' }],
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
    '{"enabled":true,"systemEnabled":true,"sound":"bell","contacts":[{"networkId":"network-1","nick":"Alice"}]}',
  );
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

test('cooldown blocks repeated cues inside the throttle window', () => {
  assert.equal(canPlayContactNotificationCue(1_500, 500), true);
  assert.equal(canPlayContactNotificationCue(1_499, 500), false);
});

test('system notification clears browser-owned handlers after click or close', () => {
  class FakeNotification {
    static instances: FakeNotification[] = [];
    closeCalls = 0;
    onclick: ((event: Event) => void) | null = null;
    onclose: ((event: Event) => void) | null = null;

    constructor(
      readonly title: string,
      readonly options?: NotificationOptions,
    ) {
      FakeNotification.instances.push(this);
    }

    close() {
      this.closeCalls += 1;
      this.onclose?.(new Event('close'));
    }
  }

  const buffer = makeBuffer({ id: 'query-alice', target: 'Alice' });
  let focusCalls = 0;
  let selectedBuffer: BufferState | null = null;
  const clicked = createContactSystemNotification({
    buffer,
    focusWindow: () => {
      focusCalls += 1;
    },
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: (nextBuffer) => {
      selectedBuffer = nextBuffer;
    },
  }) as FakeNotification;

  assert.equal(clicked.title, 'Alice');
  assert.deepEqual(clicked.options, {
    body: 'New private message on ExampleNet',
    tag: 'pulsete-dm:query-alice',
  });

  clicked.onclick?.(new Event('click'));

  assert.equal(focusCalls, 1);
  assert.equal(selectedBuffer, buffer);
  assert.equal(clicked.closeCalls, 1);
  assert.equal(clicked.onclick, null);
  assert.equal(clicked.onclose, null);

  const closed = createContactSystemNotification({
    buffer,
    networkName: 'ExampleNet',
    notificationConstructor: FakeNotification,
    onSelectBuffer: () => undefined,
  }) as FakeNotification;
  closed.onclose?.(new Event('close'));

  assert.equal(closed.onclick, null);
  assert.equal(closed.onclose, null);
});
