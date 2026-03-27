import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { BufferState, FriendState, ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';

export class RuntimeFriendPresenceProjector {
  private readonly friendPresenceByNetwork = new Map<string, Set<string>>();
  private readonly friendPresenceCache = new Map<string, boolean>();
  private readonly queryPresenceCache = new Map<string, boolean>();

  clearAll() {
    this.friendPresenceByNetwork.clear();
    this.friendPresenceCache.clear();
    this.queryPresenceCache.clear();
  }

  clearNetwork(networkId: string, friends: FriendState[], buffers: BufferState[]) {
    return this.friendPresenceByNetwork.delete(networkId)
      ? this.collectDiffs(friends, buffers)
      : [];
  }

  removeNetworks(networkIds: readonly string[], friends: FriendState[], buffers: BufferState[]) {
    for (const networkId of networkIds) {
      this.friendPresenceByNetwork.delete(networkId);
    }
    return this.collectDiffs(friends, buffers);
  }

  deleteFriendPresenceCache(friendId: string) {
    this.friendPresenceCache.delete(friendId);
  }

  project(
    event: Extract<RuntimeEvent, { type: 'friend-presence' }>,
    friends: FriendState[],
    buffers: BufferState[],
  ) {
    this.friendPresenceByNetwork.set(
      event.networkId,
      new Set(event.onlineNicks.map(normalizeIrcIdentifier))
    );
    return this.collectDiffs(friends, buffers);
  }

  snapshot(friends: FriendState[]) {
    return Object.fromEntries(
      friends.map((friend) => [friend.id, this.isNickOnlineAnywhere(friend.nick)])
    );
  }

  snapshotQueries(buffers: BufferState[]) {
    return Object.fromEntries(
      buffers
        .filter((buffer) => buffer.kind === 'query')
        .map((buffer) => [
          buffer.id,
          this.isNickOnlineOnNetwork(buffer.networkId, buffer.target),
        ])
    );
  }

  collectDiffs(friends: FriendState[], buffers: BufferState[]) {
    const nextPresence = this.snapshot(friends);
    const nextQueryPresence = this.snapshotQueries(buffers);
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
    for (const [bufferId, online] of Object.entries(nextQueryPresence)) {
      if (this.queryPresenceCache.get(bufferId) === online) {
        continue;
      }
      this.queryPresenceCache.set(bufferId, online);
      messages.push({ type: 'query.presence', bufferId, online });
    }
    for (const bufferId of Array.from(this.queryPresenceCache.keys())) {
      if (bufferId in nextQueryPresence) {
        continue;
      }
      this.queryPresenceCache.delete(bufferId);
    }
    return messages;
  }

  private isNickOnlineAnywhere(nick: string) {
    const normalized = normalizeIrcIdentifier(nick);
    for (const onlineNicks of this.friendPresenceByNetwork.values()) {
      if (onlineNicks.has(normalized)) {
        return true;
      }
    }
    return false;
  }

  private isNickOnlineOnNetwork(networkId: string, nick: string) {
    return this.friendPresenceByNetwork.get(networkId)?.has(normalizeIrcIdentifier(nick)) ?? false;
  }
}
