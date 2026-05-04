import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { BufferState, FriendState, PresenceStatus } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import type { RuntimeEvent } from './irc-types.js';

export class RuntimeFriendPresenceProjector {
  private readonly friendPresenceByNetwork = new Map<string, Map<string, PresenceStatus>>();
  private readonly friendPresenceCache = new Map<string, PresenceStatus>();
  private readonly queryPresenceCache = new Map<string, PresenceStatus>();
  private readonly disconnectedQueryNetworks = new Set<string>();

  clearAll() {
    this.friendPresenceByNetwork.clear();
    this.friendPresenceCache.clear();
    this.queryPresenceCache.clear();
    this.disconnectedQueryNetworks.clear();
  }

  clearNetwork(networkId: string, friends: FriendState[], buffers: BufferState[]) {
    this.friendPresenceByNetwork.delete(networkId);
    this.disconnectedQueryNetworks.add(networkId);
    return this.collectDiffs(friends, buffers);
  }

  removeNetworks(networkIds: readonly string[], friends: FriendState[], buffers: BufferState[]) {
    for (const networkId of networkIds) {
      this.friendPresenceByNetwork.delete(networkId);
      this.disconnectedQueryNetworks.delete(networkId);
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
    this.disconnectedQueryNetworks.delete(event.networkId);
    this.friendPresenceByNetwork.set(
      event.networkId,
      new Map(
        Object.entries(event.presences).map(([nick, presence]) => [
          normalizeIrcIdentifier(nick),
          presence,
        ]),
      ),
    );
    return this.collectDiffs(friends, buffers);
  }

  snapshot(friends: FriendState[]): Record<string, PresenceStatus> {
    return Object.fromEntries(
      friends.map((friend) => [friend.id, this.resolveNickPresenceAnywhere(friend.nick)])
    ) as Record<string, PresenceStatus>;
  }

  snapshotQueries(buffers: BufferState[]): Record<string, PresenceStatus> {
    return Object.fromEntries(
      buffers
        .filter((buffer) => buffer.kind === 'query')
        .flatMap((buffer) => {
          const presence = this.resolveQueryPresenceOnNetwork(buffer.networkId, buffer.target);
          return presence ? [[buffer.id, presence]] : [];
        })
    ) as Record<string, PresenceStatus>;
  }

  collectDiffs(friends: FriendState[], buffers: BufferState[]) {
    const nextPresence = this.snapshot(friends);
    const nextQueryPresence = this.snapshotQueries(buffers);
    const messages: ServerMessage[] = [];
    for (const friend of friends) {
      const presence = nextPresence[friend.id] ?? 'offline';
      if (this.friendPresenceCache.get(friend.id) === presence) {
        continue;
      }
      this.friendPresenceCache.set(friend.id, presence);
      messages.push({
        type: 'friend.presence',
        friendId: friend.id,
        presence,
      });
    }
    for (const friendId of Array.from(this.friendPresenceCache.keys())) {
      if (friendId in nextPresence) {
        continue;
      }
      this.friendPresenceCache.delete(friendId);
    }
    for (const [bufferId, presence] of Object.entries(nextQueryPresence)) {
      const previous = this.queryPresenceCache.get(bufferId) ?? null;
      if (previous === presence) {
        continue;
      }
      this.queryPresenceCache.set(bufferId, presence);
      messages.push({ type: 'query.presence', bufferId, presence });
    }
    for (const bufferId of Array.from(this.queryPresenceCache.keys())) {
      if (bufferId in nextQueryPresence) {
        continue;
      }
      this.queryPresenceCache.delete(bufferId);
    }
    return messages;
  }

  private resolveNickPresenceAnywhere(nick: string) {
    const normalized = normalizeIrcIdentifier(nick);
    let aggregate: PresenceStatus = 'offline';
    for (const presenceByNick of this.friendPresenceByNetwork.values()) {
      const presence = presenceByNick.get(normalized) ?? 'offline';
      if (presence === 'online') {
        return 'online';
      }
      if (presence === 'away') {
        aggregate = 'away';
      }
    }
    return aggregate;
  }

  private resolveQueryPresenceOnNetwork(networkId: string, nick: string) {
    const networkPresence = this.friendPresenceByNetwork.get(networkId);
    const normalizedNick = normalizeIrcIdentifier(nick);
    if (networkPresence?.has(normalizedNick)) {
      return networkPresence.get(normalizedNick) ?? 'offline';
    }
    return this.disconnectedQueryNetworks.has(networkId) ? 'offline' : null;
  }
}
