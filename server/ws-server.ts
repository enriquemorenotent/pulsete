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
    context.runtime.attachSocket(ws);
    ws.send(encode({ type: 'state.ready', snapshot: context.runtime.snapshot() }));
    ws.on('error', () => {});
    ws.on('message', (raw) => handleClientMessage(ws, context, raw.toString()));
  });
};

const handleClientMessage = (
  ws: WebSocket,
  context: HttpContext,
  raw: string
) => {
  try {
    const message = decodeClient(raw);
    switch (message.type) {
      case 'state.request':
        ws.send(encode({ type: 'state.ready', snapshot: context.runtime.snapshot() }));
        return;
      case 'network.connect':
        context.runtime.connect(message.networkId);
        return;
      case 'network.disconnect':
        context.runtime.disconnect(message.networkId);
        return;
      case 'channel.join':
        context.runtime.send({ type: 'buffer.upsert', buffer: context.runtime.join(message.networkId, message.channel) });
        return;
      case 'channel.part':
        context.runtime.part(message.networkId, message.channel);
        return;
      case 'query.open': {
        context.runtime.send({ type: 'buffer.upsert', buffer: context.runtime.openQuery(message.networkId, message.target) });
        return;
      }
      case 'message.send':
        context.runtime.sendMessage(message.networkId, message.target, message.body, message.kind);
        return;
      case 'raw.send':
        context.runtime.sendRaw(message.networkId, message.raw);
        return;
    }
  } catch (error) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }));
  }
};
