import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol.js';
import type { HttpContext } from './http-types.js';
import { getSessionFromRequest } from './session-utils.js';

export const attachWebSocketServer = (server: Server, context: HttpContext) => {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const session = getSessionFromRequest(context.storage, req);
    if (!session) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, session.user.id));
  });
  wss.on('connection', (ws: WebSocket, _req: import('node:http').IncomingMessage, userId: string) => {
    context.runtime.attachSocket(userId, ws);
    ws.on('message', (raw) => handleClientMessage(ws, context, userId, raw.toString()));
  });
};

const handleClientMessage = (ws: WebSocket, context: HttpContext, userId: string, raw: string) => {
  try {
    const message = decodeClient(raw);
    switch (message.type) {
      case 'session.init':
      case 'state.request':
        ws.send(encode({ type: 'session.ready', snapshot: context.storage.snapshot(userId) }));
        return;
      case 'network.connect':
        context.runtime.connect(userId, message.networkId);
        return;
      case 'network.disconnect':
        context.runtime.disconnect(userId, message.networkId);
        return;
      case 'channel.join':
        context.runtime.join(userId, message.networkId, message.channel);
        return;
      case 'channel.part':
        context.runtime.part(userId, message.networkId, message.channel);
        return;
      case 'query.open': {
        const query = context.runtime.openQuery(userId, message.networkId, message.target);
        context.runtime.send(userId, { type: 'query.open', query });
        return;
      }
      case 'query.close':
        context.runtime.closeQuery(userId, message.networkId, message.target);
        context.runtime.send(userId, { type: 'query.close', networkId: message.networkId, target: message.target });
        return;
      case 'message.send':
        context.runtime.sendMessage(userId, message.networkId, message.target, message.body, message.kind);
        return;
      case 'raw.send':
        context.runtime.sendRaw(userId, message.networkId, message.raw);
        return;
    }
  } catch (error) {
    ws.send(encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }));
  }
};
