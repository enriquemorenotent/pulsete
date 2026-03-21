import { notFound } from './app-error.js';
import { normalizeFriendNick } from './irc-validate.js';
import { createRuntimeCommandResult } from './runtime-operation-types.js';
import type { RuntimeOperationContext } from './runtime-operation-types.js';

export const upsertFriend = (context: RuntimeOperationContext, nick: string) => {
  const friend = context.store.upsertFriend({ nick: normalizeFriendNick(nick) });
  context.connectionManager.syncFriendTracking();
  return createRuntimeCommandResult(friend, [
    { type: 'friend.upsert', friend },
    ...context.connectionManager.collectFriendPresenceDiffs(),
  ]);
};

export const removeFriend = (context: RuntimeOperationContext, friendId: string) => {
  const friend = context.store.removeFriend(friendId);
  if (!friend) {
    throw notFound('Friend not found');
  }
  context.connectionManager.deleteFriendPresenceCache(friend.id);
  context.connectionManager.syncFriendTracking();
  return createRuntimeCommandResult(friend, [
    ...context.connectionManager.collectFriendPresenceDiffs(),
    { type: 'friend.remove', friendId: friend.id },
  ]);
};
