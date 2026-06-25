import { useCallback, useEffect, useRef, useState } from 'react';
import type { BufferState } from '../../../shared/protocol-chat.js';
import type { ConversationMessages } from '../conversation-message-state.js';
import {
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
  addContactNotificationChannel,
  addContactNotificationContact,
  canPlayContactNotificationCue,
  findEligibleContactNotificationBuffer,
  removeContactNotificationChannel,
  removeContactNotificationContact,
  serializeContactNotificationSettings,
  type ContactNotificationChannel,
  type ContactNotificationContact,
  type ContactNotificationSound,
} from './settings.js';
import type { ContactNotificationsController } from './controller-types.js';
import {
  getAudioContextConstructor,
  getBufferMap,
  getNotificationPermission,
  playCue,
  readStoredContactNotificationSettings,
  shouldShowSystemNotification,
} from './browser.js';
import {
  closeContactSystemNotification,
  showContactSystemNotification,
  type ContactSystemNotificationHandle,
} from './system-notification.js';
export type { ContactNotificationsController } from './controller-types.js';

export function useContactNotifications(input: {
  buffers: readonly BufferState[];
  messagesByConversation?: ConversationMessages;
  networkNamesById: ReadonlyMap<string, string>;
  onSelectBuffer: (buffer: BufferState) => void;
  selectedBufferId: string | null;
}): ContactNotificationsController {
  const [settings, setSettings] = useState(readStoredContactNotificationSettings);
  const [systemPermission, setSystemPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);
  const previousBuffersRef = useRef<ReadonlyMap<string, Pick<BufferState, 'unread'>> | null>(null);
  const lastPlayedAtRef = useRef(-Infinity);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeNotificationsRef = useRef(new Set<ContactSystemNotificationHandle>());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
        serializeContactNotificationSettings(settings),
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
    setSettings((current) =>
      current.enabled === enabled ? current : { ...current, enabled });
  }, []);

  const setSystemEnabled = useCallback((enabled: boolean) => {
    setSettings((current) =>
      current.systemEnabled === enabled ? current : { ...current, systemEnabled: enabled });
  }, []);

  const setSound = useCallback((sound: ContactNotificationSound) => {
    setSettings((current) =>
      current.sound === sound ? current : { ...current, sound });
  }, []);

  const addChannel = useCallback((channel: ContactNotificationChannel) => {
    setSettings((current) => addContactNotificationChannel(current, channel));
  }, []);

  const addContact = useCallback((contact: ContactNotificationContact) => {
    setSettings((current) => addContactNotificationContact(current, contact));
  }, []);

  const removeChannel = useCallback((channel: ContactNotificationChannel) => {
    setSettings((current) => removeContactNotificationChannel(current, channel));
  }, []);

  const removeContact = useCallback((contact: ContactNotificationContact) => {
    setSettings((current) => removeContactNotificationContact(current, contact));
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

  const preview = useCallback((sound: ContactNotificationSound) => {
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
    activeNotificationsRef.current.forEach(closeContactSystemNotification);
    activeNotificationsRef.current.clear();
  }, []);

  useEffect(() => {
    const nextBuffers = getBufferMap(input.buffers);
    const previousBuffers = previousBuffersRef.current;
    previousBuffersRef.current = nextBuffers;
    if (!previousBuffers) {
      return;
    }
    if (!settings.enabled && !settings.systemEnabled) {
      return;
    }
    const eligibleBuffer = findEligibleContactNotificationBuffer({
      previousBuffers,
      nextBuffers: input.buffers,
      messagesByConversation: input.messagesByConversation,
      appVisibleAndFocused: !shouldShowSystemNotification(),
      selectedBufferId: input.selectedBufferId,
      settings,
    });
    if (!eligibleBuffer) {
      return;
    }
    const shouldPlayAudio = settings.enabled;
    const shouldNotify =
      settings.systemEnabled
      && getNotificationPermission() === 'granted'
      && shouldShowSystemNotification();
    if (!shouldPlayAudio && !shouldNotify) {
      return;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!canPlayContactNotificationCue(now, lastPlayedAtRef.current)) {
      return;
    }
    lastPlayedAtRef.current = now;
    if (shouldPlayAudio) {
      const audioContext = ensureAudioContext();
      if (audioContext) {
        void playCue(audioContext, settings.sound);
      }
    }
    if (shouldNotify) {
      showContactSystemNotification({
        activeNotifications: activeNotificationsRef.current,
        buffer: eligibleBuffer,
        networkNamesById: input.networkNamesById,
        onSelectBuffer: input.onSelectBuffer,
      });
    }
  }, [
    input.buffers,
    input.messagesByConversation,
    input.networkNamesById,
    input.onSelectBuffer,
    input.selectedBufferId,
    settings,
    ensureAudioContext,
  ]);

  return {
    settings,
    systemPermission,
    setEnabled,
    setSystemEnabled,
    setSound,
    addChannel,
    addContact,
    removeChannel,
    removeContact,
    preview,
    prime,
    requestSystemPermission,
  };
}
