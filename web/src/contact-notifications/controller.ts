import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addContactNotificationChannel,
  addContactNotificationContact,
  canPlayContactNotificationCue,
  isMessageArrivalNotificationAllowed,
  removeContactNotificationChannel,
  removeContactNotificationContact,
  type ContactNotificationChannel,
  type ContactNotificationContact,
  type ContactNotificationSound,
} from './settings.js';
import type {
  ContactNotificationsController,
  ContactNotificationsInput,
} from './controller-types.js';
import {
  getAudioContextConstructor,
  getNotificationPermission,
  playCue,
  shouldShowSystemNotification,
} from './browser.js';
import {
  closeContactSystemNotification,
  showContactSystemNotification,
  type ContactSystemNotificationHandle,
} from './system-notification.js';
import { NotificationOwner } from './notification-owner.js';
export type { ContactNotificationsController } from './controller-types.js';

export function useContactNotifications(
  input: ContactNotificationsInput,
): ContactNotificationsController {
  const settings = input.settings;
  const [systemPermission, setSystemPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);
  const lastPlayedAtRef = useRef(-Infinity);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [notificationOwner] = useState(() => new NotificationOwner<string, ContactSystemNotificationHandle>({
    close: closeContactSystemNotification,
  }));

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

  const setEnabled = useCallback((enabled: boolean) => {
    if (settings.enabled !== enabled) {
      input.onSettingsChange({ ...settings, enabled });
    }
  }, [input.onSettingsChange, settings]);

  const setSystemEnabled = useCallback((enabled: boolean) => {
    if (settings.systemEnabled !== enabled) {
      input.onSettingsChange({ ...settings, systemEnabled: enabled });
    }
  }, [input.onSettingsChange, settings]);

  const setSound = useCallback((sound: ContactNotificationSound) => {
    if (settings.sound !== sound) {
      input.onSettingsChange({ ...settings, sound });
    }
  }, [input.onSettingsChange, settings]);

  const addChannel = useCallback((channel: ContactNotificationChannel) => {
    input.onSettingsChange(addContactNotificationChannel(settings, channel));
  }, [input.onSettingsChange, settings]);

  const addContact = useCallback((contact: ContactNotificationContact) => {
    input.onSettingsChange(addContactNotificationContact(settings, contact));
  }, [input.onSettingsChange, settings]);

  const removeChannel = useCallback((channel: ContactNotificationChannel) => {
    input.onSettingsChange(removeContactNotificationChannel(settings, channel));
  }, [input.onSettingsChange, settings]);

  const removeContact = useCallback((contact: ContactNotificationContact) => {
    input.onSettingsChange(removeContactNotificationContact(settings, contact));
  }, [input.onSettingsChange, settings]);

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
    notificationOwner.closeAll();
  }, [notificationOwner]);

  const currentInput = useRef(input);
  currentInput.current = input;
  useEffect(() => input.subscribeMessageArrivals(({ buffer, message }) => {
    const input = currentInput.current;
    const settings = input.settings;
    if (!isMessageArrivalNotificationAllowed({
      arrival: { buffer, message }, settings,
      selectedBufferId: input.selectedBufferId,
      appVisibleAndFocused: !shouldShowSystemNotification(),
    })) return;
    const eligibleNotification = { buffer, latestMessage: message };
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
        avatarIconUrl: input.getAvatarIconUrl?.(eligibleNotification.buffer),
        buffer: eligibleNotification.buffer,
        iconsEnabled: input.systemNotificationIconsEnabled,
        latestMessage: eligibleNotification.latestMessage,
        networkNamesById: input.networkNamesById,
        notificationOwner,
        onSelectBuffer: input.onSelectBuffer,
      });
    }
  }), [input.subscribeMessageArrivals, notificationOwner, ensureAudioContext]);

  return useMemo(() => ({
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
  }), [
    settings, systemPermission, setEnabled, setSystemEnabled, setSound,
    addChannel, addContact, removeChannel, removeContact,
    preview, prime, requestSystemPermission,
  ]);
}
