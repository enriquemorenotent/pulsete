import type { FriendState, MutedNickState } from '../../../shared/protocol-chat.js';
import { isSameIrcIdentifier } from '../../../shared/irc-identifiers.js';
import {
  type ContactNotificationContact,
  type ContactNotificationSettings,
} from './settings.js';
import { findFriendByNick } from '../friend-utils.js';
import { findMutedNick } from '../muted-nick-utils.js';

export type ContactRuleState = {
  contact: ContactNotificationContact;
  friend: FriendState | null;
  mutedNick: MutedNickState | null;
  notificationsEnabled: boolean;
};

export type ContactRuleHandlers = {
  addFriend: (state: ContactRuleState) => Promise<boolean>;
  mute: (state: ContactRuleState) => Promise<boolean>;
  removeFriend: (state: ContactRuleState) => Promise<boolean>;
  toggleNotifications: (state: ContactRuleState) => Promise<boolean>;
  unmute: (state: ContactRuleState) => Promise<boolean>;
};

export const resolveContactRuleState = (input: {
  networkId: string;
  nick: string;
  friends: readonly FriendState[];
  mutedNicks: readonly MutedNickState[];
  contactNotifications: Pick<ContactNotificationSettings, 'contacts'>;
}): ContactRuleState => {
  const contact = { networkId: input.networkId, nick: input.nick };
  const mutedNick = findMutedNick(input.mutedNicks, input.networkId, input.nick);
  const notificationContactEnabled = input.contactNotifications.contacts.some(
    (candidate) =>
      candidate.networkId === input.networkId &&
      isSameIrcIdentifier(candidate.nick, input.nick),
  );
  return {
    contact,
    friend: findFriendByNick(input.friends, input.nick),
    mutedNick,
    notificationsEnabled: !mutedNick && notificationContactEnabled,
  };
};

export const muteContactAndDisableNotifications = async (input: {
  contact: ContactNotificationContact;
  addMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  removeNotificationContact: (contact: ContactNotificationContact) => void;
}) => {
  const muted = await input.addMutedNick(input.contact.networkId, input.contact.nick);
  if (muted) {
    input.removeNotificationContact(input.contact);
  }
  return muted;
};

export const enableContactNotificationsAndUnmute = async (input: {
  contact: ContactNotificationContact;
  mutedNick: Pick<MutedNickState, 'id'> | null;
  removeMutedNick: (mutedNickId: string) => Promise<boolean>;
  addNotificationContact: (contact: ContactNotificationContact) => void;
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

export const createContactRuleHandlers = (input: {
  addFriend: (nick: string) => Promise<boolean>;
  addMutedNick: (networkId: string, nick: string) => Promise<boolean>;
  addNotificationContact: (contact: ContactNotificationContact) => void;
  notificationsUseSound: boolean;
  primeNotifications: () => void;
  removeFriend: (friendId: string) => Promise<boolean>;
  removeMutedNick: (mutedNickId: string) => Promise<boolean>;
  removeNotificationContact: (contact: ContactNotificationContact) => void;
}): ContactRuleHandlers => ({
  addFriend: (state) => input.addFriend(state.contact.nick),
  removeFriend: (state) =>
    state.friend ? input.removeFriend(state.friend.id) : Promise.resolve(false),
  mute: (state) =>
    muteContactAndDisableNotifications({
      contact: state.contact,
      addMutedNick: input.addMutedNick,
      removeNotificationContact: input.removeNotificationContact,
    }),
  unmute: (state) =>
    state.mutedNick ? input.removeMutedNick(state.mutedNick.id) : Promise.resolve(false),
  toggleNotifications: (state) => {
    if (state.notificationsEnabled) {
      input.removeNotificationContact(state.contact);
      return Promise.resolve(true);
    }
    return enableContactNotificationsAndUnmute({
      contact: state.contact,
      mutedNick: state.mutedNick,
      removeMutedNick: input.removeMutedNick,
      addNotificationContact: input.addNotificationContact,
      onNotificationsEnabled: input.notificationsUseSound
        ? input.primeNotifications
        : undefined,
    });
  },
});
