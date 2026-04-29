import assert from 'node:assert/strict';
import test from 'node:test';
import { playCue } from '../web/src/background-dm-audio-browser.js';

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

test('audio cue disconnects scheduled nodes after playback ends', async () => {
  const oscillators: FakeOscillator[] = [];
  const gains: FakeGain[] = [];
  const audioContext = {
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
  } as unknown as AudioContext;

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
  const audioContext = {
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
  } as unknown as AudioContext;

  await playCue(audioContext, 'chirp');

  assert.equal(oscillators.length, 1);
  assert.equal(gains.length, 1);
  assert.equal(oscillators[0]!.disconnectCalls, 1);
  assert.equal(gains[0]!.disconnectCalls, 1);
  assert.equal(oscillators[0]!.onended, null);
});
