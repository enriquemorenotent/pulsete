import type { ServerMessage } from '../shared/protocol-messages.js';
import { notFound } from './app-error.js';
import { normalizeFriendNick } from './irc-validate.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { RuntimeFriendStore } from './runtime-store.js';

type RuntimeFriendServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  friends: RuntimeFriendStore;
};

export class RuntimeFriendService {
  constructor(private readonly options: RuntimeFriendServiceOptions) {}

  upsertFriend(nick: string) {
    const friend = this.options.friends.upsert({ nick: normalizeFriendNick(nick) });
    this.options.connectionManager.syncFriendTracking();
    const messages = [
      { type: 'friend.upsert', friend },
      ...this.options.connectionManager.collectFriendPresenceDiffs(),
    ] satisfies ServerMessage[];
    return { friend, messages };
  }

  removeFriend(friendId: string) {
    const friend = this.options.friends.remove(friendId);
    if (!friend) {
      throw notFound('Friend not found');
    }
    this.options.connectionManager.deleteFriendPresenceCache(friend.id);
    this.options.connectionManager.syncFriendTracking();
    const messages = [
      ...this.options.connectionManager.collectFriendPresenceDiffs(),
      { type: 'friend.remove', friendId: friend.id },
    ] satisfies ServerMessage[];
    return { friendId: friend.id, messages };
  }
}
