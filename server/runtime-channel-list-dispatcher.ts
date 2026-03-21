import type WebSocket from 'ws';
import type { RuntimeEvent } from './irc-types.js';
import type { IrcConnection } from './irc.js';
import { ChannelListSubscriptions } from './runtime-channel-lists.js';
import type { ServerMessage } from '../shared/protocol.js';

type ChannelListDispatcherMessage = Extract<
  ServerMessage,
  { type: 'channel.list.started' | 'channel.list.entry' | 'channel.list.completed' | 'channel.list.failed' }
>;

export class ChannelListDispatcher {
  private readonly subscriptions: ChannelListSubscriptions;

  constructor(sendSocket: (ws: WebSocket, message: ChannelListDispatcherMessage) => void) {
    this.subscriptions = new ChannelListSubscriptions(sendSocket);
  }

  clearAll() {
    this.subscriptions.clearAll();
  }

  clearNetwork(networkId: string) {
    this.subscriptions.clearNetwork(networkId);
  }

  removeSocket(ws: WebSocket) {
    this.subscriptions.removeSocket(ws);
  }

  request(networkId: string, connection: IrcConnection, requestId: string, requester?: WebSocket) {
    return this.subscriptions.request(networkId, connection.runtimeSession.channelList, requestId, requester);
  }

  cancel(networkId: string, requester: WebSocket) {
    this.subscriptions.cancel(networkId, requester);
  }

  handle(event: Extract<RuntimeEvent, { type: 'channel-list-entry' | 'channel-list-completed' | 'channel-list-failed' }>) {
    this.subscriptions.handleEvent(event);
  }
}
