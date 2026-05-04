import assert from 'node:assert/strict';
import test from 'node:test';
import {
  playCue,
  readStoredContactNotificationSettings,
} from '../web/src/contact-notifications/browser.js';
import { CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS } from '../web/src/contact-notifications/settings.js';
import { createAudioContextTestDouble } from './helpers/browser-test-doubles.js';

class FakeAudioParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeOscillator {
  disconnectCalls = 0;
  frequency = new FakeAudioParam();
  onended: (() => void) | null = null;
  type: OscillatorType = 'sine';

  constructor(private readonly startError: Error | null = null) {}

  connect() {}
  disconnect() {
    this.disconnectCalls += 1;
  }
  start() {
    if (this.startError) {
      throw this.startError;
    }
  }
  stop() {}
}

class FakeGain {
  disconnectCalls = 0;
  gain = new FakeAudioParam();

  connect() {}
  disconnect() {
    this.disconnectCalls += 1;
  }
}

test('stored settings can be read from the legacy preference key', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map([
    [CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS[1], JSON.stringify({
      enabled: true,
      systemEnabled: true,
      sound: 'bell',
      contacts: [{ networkId: 'network-1', nick: 'Alice' }],
    })],
  ]);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
      },
    },
  });

  try {
    assert.deepEqual(readStoredContactNotificationSettings(), {
      enabled: true,
      systemEnabled: true,
      sound: 'bell',
      contacts: [{ identity: { kind: 'nick', value: 'alice' }, networkId: 'network-1', nick: 'Alice' }],
    });
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('audio cue disconnects scheduled nodes after playback ends', async () => {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const audioContext = createAudioContextTestDouble({
    currentTime: 0,
    destination: {},
    state: 'running',
    createGain() {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    },
    createOscillator() {
      const oscillator = new FakeOscillator();
      oscillators.push(oscillator);
      return oscillator;
    },
    resume: async () => undefined,
  });

  await playCue(audioContext, 'chirp');

  assert.equal(oscillators.length, 1);
  assert.equal(gains.length, 1);
  oscillators[0]!.onended?.();

  assert.equal(oscillators[0]!.disconnectCalls, 1);
  assert.equal(gains[0]!.disconnectCalls, 1);
  assert.equal(oscillators[0]!.onended, null);
});

test('audio cue disconnects scheduled nodes when playback scheduling fails', async () => {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const audioContext = createAudioContextTestDouble({
    currentTime: 0,
    destination: {},
    state: 'running',
    createGain() {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    },
    createOscillator() {
      const oscillator = new FakeOscillator(new Error('start failed'));
      oscillators.push(oscillator);
      return oscillator;
    },
    resume: async () => undefined,
  });

  await playCue(audioContext, 'chirp');

  assert.equal(oscillators.length, 1);
  assert.equal(gains.length, 1);
  assert.equal(oscillators[0]!.disconnectCalls, 1);
  assert.equal(gains[0]!.disconnectCalls, 1);
  assert.equal(oscillators[0]!.onended, null);
});
