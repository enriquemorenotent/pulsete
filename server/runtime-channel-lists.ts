import type WebSocket from 'ws';
import { channelListBatchFlushMs, channelListBatchSize } from '../shared/channel-list.js';
import type { ChannelListEntry, ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import type { IrcRuntimeChannelListConnection } from './irc-types.js';

type ChannelListMessage = Extract<
  ServerMessage,
  { type: 'channel.list.started' | 'channel.list.entries' | 'channel.list.completed' | 'channel.list.failed' }
>;

type ChannelListConnection = IrcRuntimeChannelListConnection;

type ChannelListSession = {
  requestId: string;
  subscribers: Set<WebSocket>;
  pendingEntries: ChannelListEntry[];
  flushTimer: ReturnType<typeof setTimeout> | null;
};

export class RuntimeChannelListService {
  private readonly sessions = new Map<string, ChannelListSession>();

  constructor(private readonly send: (ws: WebSocket, message: ChannelListMessage) => void) {}

  clearAll() {
    for (const session of this.sessions.values()) {
      this.clearPendingEntries(session);
    }
    this.sessions.clear();
  }

  clearNetwork(networkId: string) {
    const session = this.sessions.get(networkId);
    if (session) {
      this.clearPendingEntries(session);
      this.sessions.delete(networkId);
    }
  }

  removeSocket(ws: WebSocket) {
    for (const session of this.sessions.values()) {
      session.subscribers.delete(ws);
      if (session.subscribers.size === 0) {
        this.clearPendingEntries(session);
      }
    }
  }

  cancel(networkId: string, ws: WebSocket) {
    const session = this.sessions.get(networkId);
    session?.subscribers.delete(ws);
    if (session?.subscribers.size === 0) {
      this.clearPendingEntries(session);
    }
  }

  request(networkId: string, connection: ChannelListConnection, requestId: string, requester?: WebSocket) {
    const activeSnapshot = connection.getActiveChannelListSnapshot();
    const activeSession = activeSnapshot
      ? this.getOrCreateSession(networkId, activeSnapshot.requestId)
      : null;
    if (activeSnapshot && activeSession) {
      const alreadySubscribed = requester ? activeSession.subscribers.has(requester) : false;
      if (alreadySubscribed) {
        return activeSnapshot.requestId;
      }
      this.flushEntries(networkId, activeSession);
      if (requester) {
        activeSession.subscribers.add(requester);
      }
      this.sendMessage(networkId, { type: 'channel.list.started', networkId, requestId: activeSnapshot.requestId }, requester);
      this.sendEntryBatches(networkId, activeSnapshot.requestId, activeSnapshot.entries, requester);
      return activeSnapshot.requestId;
    }

    if (connection.requestChannelList(requestId)) {
      this.sessions.set(networkId, {
        requestId,
        subscribers: requester ? new Set([requester]) : new Set<WebSocket>(),
        pendingEntries: [],
        flushTimer: null,
      });
      this.sendMessage(networkId, { type: 'channel.list.started', networkId, requestId }, requester);
      return requestId;
    }

    this.sendMessage(
      networkId,
      {
        type: 'channel.list.failed',
        networkId,
        requestId,
        message: connection.getChannelListRequestFailureMessage(),
      },
      requester
    );
    if (requester) {
      this.cancel(networkId, requester);
    }
    return requestId;
  }

  handle(
    event: Extract<RuntimeEvent, { type: 'channel-list-entry' | 'channel-list-completed' | 'channel-list-failed' }>
  ) {
    const session = this.sessions.get(event.networkId);
    if (!session || session.requestId !== event.requestId) {
      return;
    }
    if (event.type === 'channel-list-entry') {
      this.queueEntry(event.networkId, session, event.entry);
      return;
    }

    if (event.type === 'channel-list-completed') {
      this.flushEntries(event.networkId, session);
      this.sendMessage(event.networkId, {
        type: 'channel.list.completed',
        networkId: event.networkId,
        requestId: event.requestId,
        totalEntries: event.totalEntries,
        truncated: event.truncated,
      });
      this.clearNetwork(event.networkId);
      return;
    }

    this.flushEntries(event.networkId, session);
    this.sendMessage(event.networkId, {
      type: 'channel.list.failed',
      networkId: event.networkId,
      requestId: event.requestId,
      message: event.message,
    });
    this.clearNetwork(event.networkId);
  }

  private sendMessage(networkId: string, message: ChannelListMessage, requester?: WebSocket) {
    if (requester) {
      this.send(requester, message);
      return;
    }

    const subscribers = this.sessions.get(networkId)?.subscribers;
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const ws of Array.from(subscribers)) {
      this.send(ws, message);
    }
  }

  private queueEntry(networkId: string, session: ChannelListSession, entry: ChannelListEntry) {
    if (session.subscribers.size === 0) {
      return;
    }
    session.pendingEntries.push(entry);
    if (session.pendingEntries.length >= channelListBatchSize) {
      this.flushEntries(networkId, session);
      return;
    }
    this.scheduleFlush(networkId, session);
  }

  private scheduleFlush(networkId: string, session: ChannelListSession) {
    if (session.flushTimer) {
      return;
    }
    session.flushTimer = setTimeout(() => {
      session.flushTimer = null;
      this.flushEntries(networkId, session);
    }, channelListBatchFlushMs);
    session.flushTimer.unref?.();
  }

  private flushEntries(networkId: string, session: ChannelListSession) {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.pendingEntries.length === 0) {
      return;
    }
    const entries = session.pendingEntries;
    session.pendingEntries = [];
    this.sendMessage(networkId, {
      type: 'channel.list.entries',
      networkId,
      requestId: session.requestId,
      entries,
    });
  }

  private sendEntryBatches(
    networkId: string,
    requestId: string,
    entries: readonly ChannelListEntry[],
    requester?: WebSocket
  ) {
    for (let index = 0; index < entries.length; index += channelListBatchSize) {
      this.sendMessage(networkId, {
        type: 'channel.list.entries',
        networkId,
        requestId,
        entries: entries.slice(index, index + channelListBatchSize),
      }, requester);
    }
  }

  private clearPendingEntries(session: ChannelListSession) {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    session.pendingEntries = [];
  }

  private getOrCreateSession(networkId: string, requestId: string) {
    const existing = this.sessions.get(networkId);
    if (existing?.requestId === requestId) {
      return existing;
    }
    const created: ChannelListSession = {
      requestId,
      subscribers: new Set<WebSocket>(),
      pendingEntries: [],
      flushTimer: null,
    };
    this.sessions.set(networkId, created);
    return created;
  }
}
