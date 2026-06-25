import type {
  ContactNotificationChannel,
  ContactNotificationContact,
  ContactNotificationSettings,
  ContactNotificationSound,
} from './settings.js';

export type ContactNotificationsController = {
  settings: ContactNotificationSettings;
  systemPermission: NotificationPermission | 'unsupported';
  setEnabled: (enabled: boolean) => void;
  setSystemEnabled: (enabled: boolean) => void;
  setSound: (sound: ContactNotificationSound) => void;
  addChannel: (channel: ContactNotificationChannel) => void;
  addContact: (contact: ContactNotificationContact) => void;
  removeChannel: (channel: ContactNotificationChannel) => void;
  removeContact: (contact: ContactNotificationContact) => void;
  preview: (sound: ContactNotificationSound) => void;
  prime: () => void;
  requestSystemPermission: () => Promise<NotificationPermission | 'unsupported'>;
};
