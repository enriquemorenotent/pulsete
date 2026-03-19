import type { FriendState } from '../../shared/protocol.js';

export const friendsMatchNick = (friendNick: string, nick: string) =>
  friendNick.localeCompare(nick, undefined, { sensitivity: 'accent' }) === 0;

export const findFriendByNick = (friends: FriendState[], nick: string) =>
  friends.find((friend) => friendsMatchNick(friend.nick, nick)) ?? null;
