import type { FriendState } from '../../shared/protocol.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';

export const friendsMatchNick = (friendNick: string, nick: string) =>
  isSameIrcIdentifier(friendNick, nick);

export const findFriendByNick = (friends: readonly FriendState[], nick: string) =>
  friends.find((friend) => friendsMatchNick(friend.nick, nick)) ?? null;
