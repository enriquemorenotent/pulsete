import { notFound } from './app-error.js';
import { normalizeFriendNick } from './irc-validate.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

export const upsertFriend = (context: RuntimeOperationContext, nick: string) => {
  const friend = context.store.upsertFriend({ nick: normalizeFriendNick(nick) });
  context.send({ type: 'friend.upsert', friend });
  context.connectionManager.syncFriendTracking();
  context.connectionManager.broadcastFriendPresenceDiffs();
  return friend;
};

export const removeFriend = (context: RuntimeOperationContext, friendId: string) => {
  const friend = context.store.removeFriend(friendId);
  if (!friend) {
    throw notFound('Friend not found');
  }
  context.connectionManager.deleteFriendPresenceCache(friend.id);
  context.connectionManager.syncFriendTracking();
  context.connectionManager.broadcastFriendPresenceDiffs();
  context.send({ type: 'friend.remove', friendId: friend.id });
  return friend;
};

