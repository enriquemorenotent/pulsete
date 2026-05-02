import type { BufferState } from '../../../shared/protocol.js';
import {
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS,
  parseContactNotificationSettings,
  type ContactNotificationSettings,
  type ContactNotificationSound,
} from './settings.js';

type AudioContextConstructor = typeof AudioContext;

export const readStoredContactNotificationSettings = (): ContactNotificationSettings => {
  if (typeof window === 'undefined') {
    return parseContactNotificationSettings(null);
  }
  try {
    for (const storageKey of CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEYS) {
      const value = window.localStorage.getItem(storageKey);
      if (value) {
        return parseContactNotificationSettings(value);
      }
    }
    return parseContactNotificationSettings(null);
  } catch {
    return parseContactNotificationSettings(null);
  }
};

export const getAudioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.AudioContext ?? null;
};

export const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
};

export const shouldShowSystemNotification = () => {
  if (typeof document === 'undefined') {
    return false;
  }
  const isVisible = document.visibilityState === 'visible';
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return !isVisible || !hasFocus;
};

export const getBufferMap = (buffers: readonly BufferState[]) =>
  new Map(buffers.map((buffer) => [buffer.id, { unread: buffer.unread }]));

const disconnectAudioNode = (node: AudioNode) => {
  try {
    node.disconnect();
  } catch {
    // Ignore disconnect failures while releasing a partially scheduled cue.
  }
};

const scheduleOscillator = (input: {
  audioContext: AudioContext;
  startAt: number;
  type: OscillatorType;
  startFrequency: number;
  endFrequency: number;
  attackGain: number;
  attackDuration: number;
  releaseAt: number;
}) => {
  const oscillator = input.audioContext.createOscillator();
  const gain = input.audioContext.createGain();
  const cleanup = () => {
    oscillator.onended = null;
    disconnectAudioNode(oscillator);
    disconnectAudioNode(gain);
  };
  try {
    oscillator.type = input.type;
    oscillator.frequency.setValueAtTime(input.startFrequency, input.startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      input.endFrequency,
      input.releaseAt,
    );
    gain.gain.setValueAtTime(0.0001, input.startAt);
    gain.gain.exponentialRampToValueAtTime(
      input.attackGain,
      input.startAt + input.attackDuration,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, input.releaseAt);
    oscillator.connect(gain);
    gain.connect(input.audioContext.destination);
    oscillator.onended = cleanup;
    oscillator.start(input.startAt);
    oscillator.stop(input.releaseAt + 0.02);
  } catch (error) {
    cleanup();
    throw error;
  }
};

const scheduleCue = (audioContext: AudioContext, sound: ContactNotificationSound) => {
  const startAt = audioContext.currentTime + 0.01;
  if (sound === 'bell') {
    scheduleBellCue(audioContext, startAt);
    return;
  }
  if (sound === 'glass') {
    scheduleGlassCue(audioContext, startAt);
    return;
  }
  scheduleOscillator({
    audioContext,
    startAt,
    type: 'sine',
    startFrequency: 880,
    endFrequency: 660,
    attackGain: 0.08,
    attackDuration: 0.01,
    releaseAt: startAt + 0.22,
  });
};

const scheduleBellCue = (audioContext: AudioContext, startAt: number) => {
  scheduleOscillator({
    audioContext,
    startAt,
    type: 'sine',
    startFrequency: 1174,
    endFrequency: 880,
    attackGain: 0.075,
    attackDuration: 0.015,
    releaseAt: startAt + 0.35,
  });
  scheduleOscillator({
    audioContext,
    startAt: startAt + 0.04,
    type: 'triangle',
    startFrequency: 1567,
    endFrequency: 1174,
    attackGain: 0.04,
    attackDuration: 0.02,
    releaseAt: startAt + 0.28,
  });
};

const scheduleGlassCue = (audioContext: AudioContext, startAt: number) => {
  scheduleOscillator({
    audioContext,
    startAt,
    type: 'triangle',
    startFrequency: 1318,
    endFrequency: 1760,
    attackGain: 0.06,
    attackDuration: 0.01,
    releaseAt: startAt + 0.16,
  });
  scheduleOscillator({
    audioContext,
    startAt: startAt + 0.09,
    type: 'sine',
    startFrequency: 1760,
    endFrequency: 2349,
    attackGain: 0.045,
    attackDuration: 0.01,
    releaseAt: startAt + 0.23,
  });
};

export const playCue = async (
  audioContext: AudioContext | null,
  sound: ContactNotificationSound,
) => {
  if (!audioContext) {
    return;
  }
  try {
    if (audioContext.state !== 'running') {
      await audioContext.resume();
    }
    if (audioContext.state !== 'running') {
      return;
    }
    scheduleCue(audioContext, sound);
  } catch {
    // Browser autoplay policies can reject resume/playback outside trusted gestures.
  }
};
