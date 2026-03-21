import type WebSocket from 'ws';
import type { ChannelListEntry, ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';

type ChannelListMessage = Extract<
  ServerMessage,
  { type: 'channel.list.started' | 'channel.list.entry' | 'channel.list.completed' | 'channel.list.failed' }
>;

type ChannelListConnection = {
  getActiveChannelListSnapshot(): { requestId: string; entries: ChannelListEntry[] } | null;
  requestChannelList(requestId: string): boolean;
  getChannelListRequestFailureMessage(): string;
};

export class ChannelListSubscriptions {
  private readonly subscribers = new Map<string, Set<WebSocket>>();

  constructor(private readonly send: (ws: WebSocket, message: ChannelListMessage) => void) {}

  clearAll() {
    this.subscribers.clear();
  }

  clearNetwork(networkId: string) {
    this.subscribers.delete(networkId);
  }

  removeSocket(ws: WebSocket) {
    for (const [networkId, subscribers] of Array.from(this.subscribers.entries())) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.subscribers.delete(networkId);
      }
    }
  }

  cancel(networkId: string, ws: WebSocket) {
    const subscribers = this.subscribers.get(networkId);
    if (!subscribers) {
      return;
    }
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      this.subscribers.delete(networkId);
    }
  }

  request(networkId: string, connection: ChannelListConnection, requestId: string, requester?: WebSocket) {
    const alreadySubscribed = requester ? this.hasSubscriber(networkId, requester) : false;
    if (requester && !alreadySubscribed) {
      this.addSubscriber(networkId, requester);
    }

    const activeRequest = connection.getActiveChannelListSnapshot();
    if (activeRequest) {
      if (alreadySubscribed) {
        return activeRequest.requestId;
      }
      this.sendMessage(networkId, { type: 'channel.list.started', networkId, requestId: activeRequest.requestId }, requester);
      for (const entry of activeRequest.entries) {
        this.sendMessage(
          networkId,
          { type: 'channel.list.entry', networkId, requestId: activeRequest.requestId, entry },
          requester
        );
      }
      return activeRequest.requestId;
    }

    if (connection.requestChannelList(requestId)) {
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

  handleEvent(
    event: Extract<RuntimeEvent, { type: 'channel-list-entry' | 'channel-list-completed' | 'channel-list-failed' }>
  ) {
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
      this.clearNetwork(event.networkId);
      return;
    }

    this.sendMessage(event.networkId, {
      type: 'channel.list.failed',
      networkId: event.networkId,
      requestId: event.requestId,
      message: event.message,
    });
    this.clearNetwork(event.networkId);
  }

  private hasSubscriber(networkId: string, ws: WebSocket) {
    return this.subscribers.get(networkId)?.has(ws) ?? false;
  }

  private addSubscriber(networkId: string, ws: WebSocket) {
    this.removeSocket(ws);
    const subscribers = this.subscribers.get(networkId) ?? new Set<WebSocket>();
    subscribers.add(ws);
    this.subscribers.set(networkId, subscribers);
  }

  private sendMessage(networkId: string, message: ChannelListMessage, requester?: WebSocket) {
    if (requester) {
      this.send(requester, message);
      return;
    }

    const subscribers = this.subscribers.get(networkId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const ws of Array.from(subscribers)) {
      this.send(ws, message);
    }
  }
}
