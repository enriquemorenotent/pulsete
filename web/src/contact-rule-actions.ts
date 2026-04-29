import type { BackgroundDmAudioContact } from './background-dm-audio.js';

export type ContactRuleMutedState = { id: string } | null;

export const muteContactAndDisableNotifications = async (input: {
  contact: BackgroundDmAudioContact;
  addMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  removeNotificationContact: (contact: BackgroundDmAudioContact) => void;
}) => {
  const muted = await input.addMutedNick(input.contact.networkId, input.contact.nick);
  if (muted) {
    input.removeNotificationContact(input.contact);
  }
  return muted;
};

export const enableContactNotificationsAndUnmute = async (input: {
  contact: BackgroundDmAudioContact;
  mutedNick: ContactRuleMutedState;
  removeMutedNick: (mutedNickId: string) => Promise<boolean>;
  addNotificationContact: (contact: BackgroundDmAudioContact) => void;
  onNotificationsEnabled?: () => void;
}) => {
  if (input.mutedNick) {
    const unmuted = await input.removeMutedNick(input.mutedNick.id);
    if (!unmuted) {
      return false;
    }
  }
  input.addNotificationContact(input.contact);
  input.onNotificationsEnabled?.();
  return true;
};
