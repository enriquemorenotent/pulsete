import type { FriendState, MutedNickState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import {
  type BackgroundDmAudioContact,
  type BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { findFriendByNick } from './friend-utils.js';
import { findMutedNick } from './muted-nick-utils.js';

export type ContactRuleState = {
  contact: BackgroundDmAudioContact;
  friend: FriendState | null;
  mutedNick: MutedNickState | null;
  notificationsEnabled: boolean;
};

export const resolveContactRuleState = (input: {
  networkId: string;
  nick: string;
  friends: readonly FriendState[];
  mutedNicks: readonly MutedNickState[];
  backgroundDmAudio: Pick<BackgroundDmAudioSettings, 'contacts'>;
}): ContactRuleState => {
  const contact = { networkId: input.networkId, nick: input.nick };
  const mutedNick = findMutedNick(input.mutedNicks, input.networkId, input.nick);
  const notificationContactEnabled = input.backgroundDmAudio.contacts.some(
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
