import type WebSocket from 'ws';
import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import type { IrcRuntimeChannelListConnection } from './irc-types.js';

type ChannelListMessage = Extract<
  ServerMessage,
  { type: 'channel.list.started' | 'channel.list.entry' | 'channel.list.completed' | 'channel.list.failed' }
>;

type ChannelListConnection = IrcRuntimeChannelListConnection;

type ChannelListSession = {
  requestId: string;
  subscribers: Set<WebSocket>;
};

export class RuntimeChannelListService {
  private readonly sessions = new Map<string, ChannelListSession>();

  constructor(private readonly send: (ws: WebSocket, message: ChannelListMessage) => void) {}

  clearAll() {
    this.sessions.clear();
  }

  clearNetwork(networkId: string) {
    this.sessions.delete(networkId);
  }

  removeSocket(ws: WebSocket) {
    for (const session of this.sessions.values()) {
      session.subscribers.delete(ws);
    }
  }

  cancel(networkId: string, ws: WebSocket) {
    this.sessions.get(networkId)?.subscribers.delete(ws);
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
      if (requester) {
        activeSession.subscribers.add(requester);
      }
      this.sendMessage(networkId, { type: 'channel.list.started', networkId, requestId: activeSnapshot.requestId }, requester);
      for (const entry of activeSnapshot.entries) {
        this.sendMessage(
          networkId,
          { type: 'channel.list.entry', networkId, requestId: activeSnapshot.requestId, entry },
          requester
        );
      }
      return activeSnapshot.requestId;
    }

    if (connection.requestChannelList(requestId)) {
      this.sessions.set(networkId, {
        requestId,
        subscribers: requester ? new Set([requester]) : new Set<WebSocket>(),
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
      this.sendMessage(event.networkId, {
        type: 'channel.list.entry',
        networkId: event.networkId,
        requestId: event.requestId,
        entry: event.entry,
      });
      return;
    }

    if (event.type === 'channel-list-completed') {
      this.sendMessage(event.networkId, {
        type: 'channel.list.completed',
        networkId: event.networkId,
        requestId: event.requestId,
      });
      this.sessions.delete(event.networkId);
      return;
    }

    this.sendMessage(event.networkId, {
      type: 'channel.list.failed',
      networkId: event.networkId,
      requestId: event.requestId,
      message: event.message,
    });
    this.sessions.delete(event.networkId);
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

  private getOrCreateSession(networkId: string, requestId: string) {
    const existing = this.sessions.get(networkId);
    if (existing?.requestId === requestId) {
      return existing;
    }
    const created: ChannelListSession = { requestId, subscribers: new Set<WebSocket>() };
    this.sessions.set(networkId, created);
    return created;
  }
}
