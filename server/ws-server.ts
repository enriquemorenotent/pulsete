import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol.js';
import { AppError } from './app-error.js';
import type { HttpContext } from './http-types.js';
import { jsonBodyLimitBytes, tryParseRequestUrl } from './http-utils.js';
import { getSessionTokenFromRequest } from './session-utils.js';

export const attachWebSocketServer = (server: Server, context: HttpContext) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: jsonBodyLimitBytes });
  server.on('upgrade', (req, socket, head) => {
    const url = tryParseRequestUrl(req.url);
    if (!url || url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const sessionToken = getSessionTokenFromRequest(req);
    const session = sessionToken ? context.storage.getSession(sessionToken) : null;
    if (!session || !sessionToken) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit('connection', ws, req, { sessionToken, userId: session.user.id })
    );
  });
  wss.on(
    'connection',
    (
      ws: WebSocket,
      _req: import('node:http').IncomingMessage,
      auth: { sessionToken: string; userId: string }
    ) => {
      context.runtime.attachSocket(auth.userId, auth.sessionToken, ws);
      ws.on('error', () => {});
      ws.on('message', (raw) => handleClientMessage(ws, context, auth.userId, auth.sessionToken, raw.toString()));
    }
  );
};

const getAuthorizedSession = (
  ws: WebSocket,
  context: HttpContext,
  userId: string,
  sessionToken: string
) => {
  const session = context.storage.getSession(sessionToken);
  if (!session || session.user.id !== userId) {
    context.runtime.revokeSession(sessionToken, userId);
    ws.close(1008, 'Authentication required');
    return null;
  }
  return session;
};

const handleClientMessage = (
  ws: WebSocket,
  context: HttpContext,
  userId: string,
  sessionToken: string,
  raw: string
) => {
  if (!getAuthorizedSession(ws, context, userId, sessionToken)) {
    return;
  }
  try {
    const message = decodeClient(raw);
    switch (message.type) {
      case 'session.init':
      case 'state.request':
        ws.send(encode({ type: 'session.ready', snapshot: context.storage.snapshot(userId) }));
        return;
      case 'network.connect':
        context.runtime.connect(userId, message.networkId, sessionToken);
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
    if (error instanceof AppError && error.status === 401) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1008, error.message);
      }
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }));
  }
};
