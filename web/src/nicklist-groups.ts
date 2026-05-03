import type { ChannelUserState, FriendState } from '../../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { ChannelUserGroup } from './channel-user-groups.js';
import { groupChannelUsers } from './channel-user-groups.js';

export const buildNicklistGroups = (
  users: ChannelUserState[],
  friends: FriendState[],
  query: string,
): ChannelUserGroup[] => {
  const normalizedQuery = normalizeNicklistQuery(query);
  if (!normalizedQuery) {
    return groupChannelUsers(users);
  }

  const friendNicks = new Set(friends.map((friend) => normalizeIrcIdentifier(friend.nick)));
  const groups = groupChannelUsers(
    users.filter((user) => normalizeIrcIdentifier(user.nick).includes(normalizedQuery)),
  );

  return groups.map((group) => ({
    ...group,
    users: [...group.users].sort((left, right) =>
      compareFilteredNicklistUsers(left, right, friendNicks, normalizedQuery),
    ),
  }));
};

const normalizeNicklistQuery = (query: string) => normalizeIrcIdentifier(query.trim());

const compareFilteredNicklistUsers = (
  left: ChannelUserState,
  right: ChannelUserState,
  friendNicks: Set<string>,
  query: string,
) => {
  const leftRank = getFilteredNicklistRank(left.nick, friendNicks, query);
  const rightRank = getFilteredNicklistRank(right.nick, friendNicks, query);
  for (let index = 0; index < leftRank.length; index += 1) {
    const difference = leftRank[index]! - rightRank[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return left.nick.localeCompare(right.nick, undefined, { sensitivity: 'accent' });
};

const getFilteredNicklistRank = (
  nick: string,
  friendNicks: Set<string>,
  query: string,
) => {
  const normalizedNick = normalizeIrcIdentifier(nick);
  return [
    normalizedNick === query ? 0 : 1,
    friendNicks.has(normalizedNick) ? 0 : 1,
    normalizedNick.startsWith(query) ? 0 : 1,
  ];
};
