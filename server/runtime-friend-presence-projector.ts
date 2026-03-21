import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { FriendState, ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';

export class RuntimeFriendPresenceProjector {
  private readonly friendPresenceByNetwork = new Map<string, Set<string>>();
  private readonly friendPresenceCache = new Map<string, boolean>();

  clearAll() {
    this.friendPresenceByNetwork.clear();
    this.friendPresenceCache.clear();
  }

  clearNetwork(networkId: string, friends: FriendState[]) {
    return this.friendPresenceByNetwork.delete(networkId)
      ? this.collectDiffs(friends)
      : [];
  }

  removeNetworks(networkIds: readonly string[], friends: FriendState[]) {
    for (const networkId of networkIds) {
      this.friendPresenceByNetwork.delete(networkId);
    }
    return this.collectDiffs(friends);
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresenceCache.delete(friendId);
  }

  project(event: Extract<RuntimeEvent, { type: 'friend-presence' }>, friends: FriendState[]) {
    this.friendPresenceByNetwork.set(
      event.networkId,
      new Set(event.onlineNicks.map(normalizeIrcIdentifier))
    );
    return this.collectDiffs(friends);
  }

  snapshot(friends: FriendState[]) {
    return Object.fromEntries(friends.map((friend) => [friend.id, this.isFriendOnline(friend.nick)]));
  }

  collectDiffs(friends: FriendState[]) {
    const nextPresence = this.snapshot(friends);
    const messages: ServerMessage[] = [];
    for (const friend of friends) {
      const online = nextPresence[friend.id] ?? false;
      if (this.friendPresenceCache.get(friend.id) === online) {
        continue;
      }
      this.friendPresenceCache.set(friend.id, online);
      messages.push({ type: 'friend.presence', friendId: friend.id, online });
    }
    for (const friendId of Array.from(this.friendPresenceCache.keys())) {
      if (friendId in nextPresence) {
        continue;
      }
      this.friendPresenceCache.delete(friendId);
    }
    return messages;
  }

  private isFriendOnline(nick: string) {
    const normalized = normalizeIrcIdentifier(nick);
    for (const onlineNicks of this.friendPresenceByNetwork.values()) {
      if (onlineNicks.has(normalized)) {
        return true;
      }
    }
    return false;
  }
}
