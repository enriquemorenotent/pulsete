import { normalizeIrcIdentifier } from '../shared/irc-identifiers.js';
import type { PresenceStatus } from '../shared/protocol-chat.js';
import { activityRetentionMs, type WatchlistActivity } from '../shared/watchlist-activity.js';
import type { RuntimeEvent } from './irc-types.js';
import type { StorageFriendsRepository } from './storage-friends-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';
import { notFound } from './app-error.js';

type Observation = {
  id: number;
  friendId: string;
  networkId: string;
  status: PresenceStatus;
  transport: 'monitor' | 'ison';
  confirmed: number;
  end: number;
};
const checkpointMs = 30_000;
const maxCheckpointGapMs = 90_000;
const pollLeaseMs = 6 * 60_000;

export class RuntimeWatchlistActivity {
  private readonly active = new Map<string, Observation>();
  private lastTick: number;
  private lastPrune: number;
  private readonly timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly friends: StorageFriendsRepository,
    private readonly networks: Pick<StorageNetworksRepository, 'list'>,
    private readonly now = Date.now,
    startTimer = true,
  ) {
    this.lastTick = this.lastPrune = now();
    friends.activity.prune(this.lastTick);
    if (startTimer) {
      this.timer = setInterval(() => this.tick(), checkpointMs);
      this.timer.unref();
    }
  }

  tick() {
    if (this.friends.activity.closed) {
      if (this.timer) clearInterval(this.timer);
      this.active.clear();
      return;
    }
    const now = this.now();
    // A paused process cannot attest to the time it missed (e.g. laptop suspend).
    if (now < this.lastTick || now - this.lastTick > maxCheckpointGapMs) {
      this.active.clear();
    }
    this.lastTick = now;
    const friendIds = new Set(this.friends.list().map((friend) => friend.id));
    for (const [key, observation] of this.active) {
      if (!friendIds.has(observation.friendId)) {
        this.active.delete(key);
        continue;
      }
      const end = observation.transport === 'ison'
        ? Math.min(now, observation.confirmed + pollLeaseMs) : now;
      this.friends.activity.extend(observation.id, end);
      observation.end = end;
      if (end < now) this.active.delete(key);
    }
    if (now - this.lastPrune >= 60 * 60_000) {
      this.friends.activity.prune(now);
      this.lastPrune = now;
    }
  }

  route(event: RuntimeEvent) {
    if (event.type === 'state' && event.phase !== 'connected') {
      this.clearNetwork(event.networkId);
    } else if (event.type === 'friend-observation') {
      this.observe(event);
    } else if (event.type === 'peer-quit' && !event.self) {
      this.tick();
      for (const friend of this.friends.list()) {
        if (normalizeIrcIdentifier(friend.nick) !== normalizeIrcIdentifier(event.nick)) continue;
        const key = this.key(event.networkId, friend.id);
        const previous = this.active.get(key);
        // A QUIT is evidence of leaving only within an existing observation.
        if (previous) this.record(key, friend.id, event.networkId, 'offline', previous.transport);
      }
    }
  }

  private observe(event: Extract<RuntimeEvent, { type: 'friend-observation' }>) {
    this.tick();
    if (!event.transport) {
      this.clearNetwork(event.networkId);
      return;
    }
    const presences = new Map(Object.entries(event.presences)
      .map(([nick, status]) => [normalizeIrcIdentifier(nick), status]));
    for (const friend of this.friends.list()) {
      const key = this.key(event.networkId, friend.id);
      const status = presences.get(normalizeIrcIdentifier(friend.nick));
      if (status) this.record(key, friend.id, event.networkId, status, event.transport);
      else if (event.transport === 'ison') this.active.delete(key);
    }
  }

  private record(key: string, friendId: string, networkId: string,
    status: PresenceStatus, transport: 'monitor' | 'ison') {
    const now = this.now();
    const previous = this.active.get(key);
    if (previous?.status === status && previous.transport === transport) {
      previous.confirmed = now;
      return;
    }
    const arrival = previous?.transport === transport && previous.status === 'offline' && status !== 'offline';
    const id = this.friends.activity.start(friendId, {
      networkId, status, start: now, end: now, arrival, transport,
    });
    this.active.set(key, { id, friendId, networkId, status, transport, confirmed: now, end: now });
  }

  clearNetwork(networkId: string) {
    this.tick();
    for (const [key, observation] of this.active) {
      if (observation.networkId === networkId) this.active.delete(key);
    }
  }

  removeFriend(friendId: string) {
    for (const [key, observation] of this.active) {
      if (observation.friendId === friendId) this.active.delete(key);
    }
  }

  read(friendId: string): WatchlistActivity {
    if (!this.friends.get(friendId)) throw notFound('Friend not found');
    this.tick();
    const until = this.now();
    const since = until - activityRetentionMs;
    return {
      since, until,
      networks: this.networks.list().map(({ id, name }) => ({ id, name })),
      intervals: this.friends.activity.list(friendId, since),
    };
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.tick();
    this.active.clear();
  }

  private key(networkId: string, friendId: string) {
    return JSON.stringify([networkId, friendId]);
  }
}
