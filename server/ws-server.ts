import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol.js';
import type { HttpContext } from './http-types.js';
import { jsonBodyLimitBytes, tryParseRequestUrl } from './http-utils.js';

export const attachWebSocketServer = (server: Server, context: HttpContext) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: jsonBodyLimitBytes });
  server.on('upgrade', (req, socket, head) => {
    const url = tryParseRequestUrl(req.url);
    if (!url || url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws: WebSocket) => {
    if (!initializeWebSocketConnection(ws, context)) {
      return;
    }
  });
};

export const initializeWebSocketConnection = (ws: WebSocket, context: HttpContext) => {
  ws.on('error', () => {});
  ws.on('message', (raw) => handleClientMessage(ws, context, raw.toString()));
  context.runtime.attachSocket(ws);
  if (!sendManagedEncoded(ws, context, encode({ type: 'state.ready', snapshot: context.runtime.snapshot() }))) {
    return false;
  }
  return true;
};

const handleClientMessage = (
  ws: WebSocket,
  context: HttpContext,
  raw: string
) => {
  try {
    const message = decodeClient(raw);
    switch (message.type) {
      case 'network.connect':
        context.runtime.connect(message.networkId);
        return;
      case 'network.disconnect':
        context.runtime.disconnect(message.networkId);
        return;
      case 'channel.join':
        context.runtime.join(message.networkId, message.channel, message.sourceBufferId);
        return;
      case 'channel.part':
        context.runtime.part(message.networkId, message.channel, message.sourceBufferId);
        return;
      case 'query.open': {
        context.runtime.send({ type: 'buffer.upsert', buffer: context.runtime.openQuery(message.networkId, message.target) });
        return;
      }
      case 'message.send':
        context.runtime.sendMessage(
          message.networkId,
          message.target,
          message.body,
          message.kind,
          message.sourceBufferId
        );
        return;
      case 'raw.send':
        context.runtime.sendRaw(message.networkId, message.raw, message.sourceBufferId);
        return;
      case 'channel.list.request':
        context.runtime.requestChannelList(message.networkId, ws);
        return;
      case 'channel.list.cancel':
        context.runtime.cancelChannelList(message.networkId, ws);
        return;
    }
  } catch (error) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    sendManagedEncoded(ws, context, encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }));
  }
};

const sendManagedEncoded = (ws: WebSocket, context: HttpContext, payload: string) => {
  if (sendEncoded(ws, payload)) {
    return true;
  }
  context.runtime.detachSocket(ws);
  return false;
};

const sendEncoded = (ws: WebSocket, payload: string) => {
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  try {
    ws.send(payload);
    return true;
  } catch {
    try {
      ws.close();
    } catch {
      // Ignore close failures while cleaning up a broken socket.
    }
    return false;
  }
};
