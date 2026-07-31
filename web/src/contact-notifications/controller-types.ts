import type { BufferState } from '../../../shared/protocol-chat.js';
import type { ConversationMessages } from '../conversation-message-state.js';
import type {
  ContactNotificationChannel,
  ContactNotificationContact,
  ContactNotificationSettings,
  ContactNotificationSound,
} from './settings.js';

export type ContactNotificationsInput = {
  buffers: readonly BufferState[];
  getMessagesByConversation?: () => ConversationMessages;
  getAvatarIconUrl?: (buffer: BufferState) => string | null;
  networkNamesById: ReadonlyMap<string, string>;
  onSelectBuffer: (buffer: BufferState) => void;
  selectedBufferId: string | null;
  systemNotificationIconsEnabled?: boolean;
  settings: ContactNotificationSettings;
  onSettingsChange: (settings: ContactNotificationSettings) => void;
};

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
