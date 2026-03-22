import type { Server } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol.js';
import type { RuntimeWebSocketApi } from './runtime.js';
import { jsonBodyLimitBytes, tryParseRequestUrl } from './http-utils.js';

export const attachWebSocketServer = (server: Server, context: RuntimeWebSocketApi) => {
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

export const initializeWebSocketConnection = (ws: WebSocket, context: RuntimeWebSocketApi) => {
  ws.on('error', () => {});
  ws.on('message', (raw) => handleClientMessage(ws, context, raw.toString()));
  context.attachSocket(ws);
  if (!sendManagedEncoded(ws, context, encode({ type: 'state.ready', snapshot: context.snapshot() }))) {
    return false;
  }
  return true;
};

const handleClientMessage = (
  ws: WebSocket,
  context: RuntimeWebSocketApi,
  raw: string
) => {
  try {
    context.handleMessage(ws, decodeClient(raw));
  } catch (error) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    sendManagedEncoded(ws, context, encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }));
  }
};

const sendManagedEncoded = (ws: WebSocket, context: RuntimeWebSocketApi, payload: string) => {
  if (sendEncoded(ws, payload)) {
    return true;
  }
  context.detachSocket(ws);
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
