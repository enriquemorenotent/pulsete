import { useCallback, useEffect, useRef, useState } from 'react';
import type { BufferState } from '../../shared/protocol.js';
import {
  addBackgroundDmAudioContact,
  BACKGROUND_DM_AUDIO_SETTINGS_STORAGE_KEY,
  canPlayBackgroundDmAudioCue,
  findEligibleBackgroundDmNotificationBuffer,
  parseBackgroundDmAudioSettings,
  removeBackgroundDmAudioContact,
  serializeBackgroundDmAudioSettings,
  type BackgroundDmAudioContact,
  type BackgroundDmAudioSettings,
  type BackgroundDmAudioSound,
} from './background-dm-audio.js';

type BackgroundDmAudioState = {
  settings: BackgroundDmAudioSettings;
  systemPermission: NotificationPermission | 'unsupported';
  setEnabled: (enabled: boolean) => void;
  setSystemEnabled: (enabled: boolean) => void;
  setSound: (sound: BackgroundDmAudioSound) => void;
  addContact: (contact: BackgroundDmAudioContact) => void;
  removeContact: (contact: BackgroundDmAudioContact) => void;
  requestSystemPermission: () => Promise<NotificationPermission | 'unsupported'>;
};

type AudioContextConstructor = typeof AudioContext;

const readStoredSettings = () => {
  if (typeof window === 'undefined') {
    return parseBackgroundDmAudioSettings(null);
  }
  try {
    return parseBackgroundDmAudioSettings(
      window.localStorage.getItem(BACKGROUND_DM_AUDIO_SETTINGS_STORAGE_KEY),
    );
  } catch {
    return parseBackgroundDmAudioSettings(null);
  }
};

const getAudioContextConstructor = (): AudioContextConstructor | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.AudioContext ?? null;
};

const getNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission;
};

const shouldShowSystemNotification = () => {
  if (typeof document === 'undefined') {
    return false;
  }
  const isVisible = document.visibilityState === 'visible';
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return !isVisible || !hasFocus;
};

const getBufferMap = (buffers: readonly BufferState[]) =>
  new Map(buffers.map((buffer) => [buffer.id, { unread: buffer.unread }]));

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
  oscillator.start(input.startAt);
  oscillator.stop(input.releaseAt + 0.02);
};

const scheduleCue = (
  audioContext: AudioContext,
  sound: BackgroundDmAudioSound,
) => {
  const startAt = audioContext.currentTime + 0.01;
  if (sound === 'bell') {
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
    return;
  }
  if (sound === 'glass') {
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

const playCue = async (
  audioContext: AudioContext | null,
  sound: BackgroundDmAudioSound,
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

export function useBackgroundDmAudioSettings(): BackgroundDmAudioState {
  const [settings, setSettings] = useState(readStoredSettings);
  const [systemPermission, setSystemPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        BACKGROUND_DM_AUDIO_SETTINGS_STORAGE_KEY,
        serializeBackgroundDmAudioSettings(settings),
      );
    } catch {
      // Ignore storage failures; the preference simply becomes session-local.
    }
  }, [settings]);

  useEffect(() => {
    const refreshPermission = () => {
      setSystemPermission(getNotificationPermission());
    };
    refreshPermission();
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  useEffect(() => {
    if (systemPermission === 'granted') {
      return;
    }
    setSettings((current) => current.systemEnabled ? {
      ...current,
      systemEnabled: false,
    } : current);
  }, [systemPermission]);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings((current) => current.enabled === enabled ? current : {
      ...current,
      enabled,
    });
  }, []);

  const setSystemEnabled = useCallback((enabled: boolean) => {
    setSettings((current) => current.systemEnabled === enabled ? current : {
      ...current,
      systemEnabled: enabled,
    });
  }, []);

  const setSound = useCallback((sound: BackgroundDmAudioSound) => {
    setSettings((current) => current.sound === sound ? current : {
      ...current,
      sound,
    });
  }, []);

  const addContact = useCallback((contact: BackgroundDmAudioContact) => {
    setSettings((current) => addBackgroundDmAudioContact(current, contact));
  }, []);

  const removeContact = useCallback((contact: BackgroundDmAudioContact) => {
    setSettings((current) => removeBackgroundDmAudioContact(current, contact));
  }, []);

  const requestSystemPermission = useCallback(async () => {
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      setSystemPermission('unsupported');
      return 'unsupported';
    }
    try {
      const permission = await window.Notification.requestPermission();
      setSystemPermission(permission);
      return permission;
    } catch {
      const permission = getNotificationPermission();
      setSystemPermission(permission);
      return permission;
    }
  }, []);

  return {
    settings,
    systemPermission,
    setEnabled,
    setSystemEnabled,
    setSound,
    addContact,
    removeContact,
    requestSystemPermission,
  };
}

export function useBackgroundDmAudioCue(input: {
  buffers: readonly BufferState[];
  networkNamesById: ReadonlyMap<string, string>;
  onSelectBuffer: (buffer: BufferState) => void;
  selectedBufferId: string | null;
  settings: BackgroundDmAudioSettings;
}) {
  const previousBuffersRef = useRef<ReadonlyMap<string, Pick<BufferState, 'unread'>> | null>(null);
  const lastPlayedAtRef = useRef(-Infinity);
  const audioContextRef = useRef<AudioContext | null>(null);

  const ensureAudioContext = useCallback(() => {
    const AudioContextClass = getAudioContextConstructor();
    if (!AudioContextClass) {
      return null;
    }
    audioContextRef.current ??= new AudioContextClass();
    return audioContextRef.current;
  }, []);

  const prime = useCallback(() => {
    const audioContext = ensureAudioContext();
    if (!audioContext) {
      return;
    }
    void audioContext.resume().catch(() => undefined);
  }, [ensureAudioContext]);

  const preview = useCallback((sound: BackgroundDmAudioSound) => {
    const audioContext = ensureAudioContext();
    if (!audioContext) {
      return;
    }
    void playCue(audioContext, sound);
  }, [ensureAudioContext]);

  useEffect(() => () => {
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const nextBuffers = getBufferMap(input.buffers);
    const previousBuffers = previousBuffersRef.current;
    previousBuffersRef.current = nextBuffers;
    if (!previousBuffers) {
      return;
    }
    if (!input.settings.enabled && !input.settings.systemEnabled) {
      return;
    }
    const eligibleBuffer = findEligibleBackgroundDmNotificationBuffer({
      previousBuffers,
      nextBuffers: input.buffers,
      selectedBufferId: input.selectedBufferId,
      settings: input.settings,
    });
    if (!eligibleBuffer) {
      return;
    }
    const shouldPlayAudio = input.settings.enabled;
    const shouldNotify =
      input.settings.systemEnabled
      && getNotificationPermission() === 'granted'
      && shouldShowSystemNotification();
    if (!shouldPlayAudio && !shouldNotify) {
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!canPlayBackgroundDmAudioCue(now, lastPlayedAtRef.current)) {
      return;
    }
    lastPlayedAtRef.current = now;
    if (shouldPlayAudio) {
      const audioContext = ensureAudioContext();
      if (audioContext) {
        void playCue(audioContext, input.settings.sound);
      }
    }
    if (shouldNotify) {
      try {
        const networkName =
          input.networkNamesById.get(eligibleBuffer.networkId) ?? eligibleBuffer.networkId;
        const notification = new window.Notification(eligibleBuffer.target, {
          body: `New private message on ${networkName}`,
          tag: `pulsete-dm:${eligibleBuffer.id}`,
        });
        notification.onclick = () => {
          window.focus();
          input.onSelectBuffer(eligibleBuffer);
          notification.close();
        };
      } catch {
        // Browser notification delivery can still fail despite granted permission.
      }
    }
  }, [
    input.buffers,
    input.networkNamesById,
    input.onSelectBuffer,
    input.selectedBufferId,
    input.settings,
  ]);

  return { prime, preview };
}
