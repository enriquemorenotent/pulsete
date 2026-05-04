import type WebSocket from 'ws';
import type { ClientMessage } from '../shared/protocol-messages.js';
import type { RuntimeIrcService } from './runtime-irc-service.js';
import type { RuntimeNetworkSessionService } from './runtime-network-session-service.js';
import type { RuntimeHttpApi, RuntimeWebSocketApi } from './runtime-service-types.js';

type CreateRuntimeWebSocketApiParams = {
  attachSocket(ws: WebSocket): void;
  detachSocket(ws: WebSocket): void;
  http: RuntimeHttpApi;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  sessions: RuntimeNetworkSessionService;
  snapshot: RuntimeWebSocketApi['snapshot'];
};

export const createRuntimeWebSocketApi = ({
  attachSocket,
  detachSocket,
  http,
  irc,
  sessions,
  snapshot,
}: CreateRuntimeWebSocketApiParams): RuntimeWebSocketApi => ({
  attachSocket,
  detachSocket,
  snapshot,
  handleMessage: (ws, message) => dispatchRuntimeClientMessage(ws, message, { http, irc, sessions }),
});

type RuntimeClientMessageDispatcher = {
  http: RuntimeHttpApi;
  irc: Pick<RuntimeIrcService, 'join' | 'part' | 'sendMessage' | 'sendRaw'>;
  sessions: RuntimeNetworkSessionService;
};

const dispatchRuntimeClientMessage = (
  ws: WebSocket,
  message: ClientMessage,
  dispatcher: RuntimeClientMessageDispatcher
) => {
  switch (message.type) {
    case 'network.connect':
      dispatcher.http.networks.connect(message.networkId);
      return;
    case 'network.disconnect':
      dispatcher.http.networks.disconnect(message.networkId);
      return;
    case 'channel.join':
      dispatcher.http.buffers.joinChannel(message.networkId, message.channel, message.sourceBufferId);
      return;
    case 'channel.part':
      dispatcher.irc.part(message.networkId, message.channel, message.sourceBufferId);
      return;
    case 'query.open':
      dispatcher.http.buffers.openQuery(message.networkId, message.target, message.peerIdentity);
      return;
    case 'message.send':
      dispatcher.irc.sendMessage(
        message.networkId,
        message.target,
        message.body,
        message.kind,
        message.sourceBufferId
      );
      return;
    case 'raw.send':
      dispatcher.irc.sendRaw(message.networkId, message.raw, message.sourceBufferId);
      return;
    case 'channel.list.request':
      dispatcher.sessions.requestChannelList(message.networkId, ws);
      return;
    case 'channel.list.cancel':
      dispatcher.sessions.cancelChannelList(message.networkId, ws);
      return;
  }
};
