import type { ServerMessage } from '../shared/protocol.js';
import { notFound } from './app-error.js';
import { normalizeFriendNick } from './irc-validate.js';
import type { RuntimeConnectionManager } from './runtime-connection-manager.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';

type RuntimeFriendServiceOptions = {
  connectionManager: RuntimeConnectionManager;
  friends: StorageFriendsRepository;
  publish(messages: readonly ServerMessage[]): void;
};

export class RuntimeFriendService {
  constructor(private readonly options: RuntimeFriendServiceOptions) {}

  upsertFriend(nick: string) {
    return this.upsertFriendResult(nick).friend;
  }

  upsertFriendResult(nick: string) {
    const friend = this.options.friends.upsert({ nick: normalizeFriendNick(nick) });
    this.options.connectionManager.syncFriendTracking();
    const messages = [
      { type: 'friend.upsert', friend },
      ...this.options.connectionManager.collectFriendPresenceDiffs(),
    ] satisfies ServerMessage[];
    this.publish(messages);
    return { friend, messages };
  }

  removeFriend(friendId: string) {
    return this.removeFriendResult(friendId).friendId;
  }

  removeFriendResult(friendId: string) {
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
    this.publish(messages);
    return { friendId: friend.id, messages };
  }

  private publish(messages: readonly ServerMessage[]) {
    if (messages.length > 0) {
      this.options.publish(messages);
    }
  }
}
