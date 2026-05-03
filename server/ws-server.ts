import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol-messages.js';
import type { RuntimeWebSocketApi } from './runtime.js';
import { jsonBodyLimitBytes, tryParseRequestUrl } from './http-utils.js';

export const attachWebSocketServer = (server: Server, context: RuntimeWebSocketApi) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: jsonBodyLimitBytes });
  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = tryParseRequestUrl(req.url);
    if (!url || url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  const handleConnection = (ws: WebSocket) => {
    if (!initializeWebSocketConnection(ws, context)) {
      return;
    }
  };
  const cleanup = () => {
    server.removeListener('upgrade', handleUpgrade);
    wss.removeListener('connection', handleConnection);
    for (const ws of wss.clients) {
      context.detachSocket(ws);
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        // Ignore close failures during server shutdown cleanup.
      }
    }
    wss.close();
  };
  server.on('upgrade', handleUpgrade);
  server.once('close', cleanup);
  wss.on('connection', handleConnection);
};

export const initializeWebSocketConnection = (ws: WebSocket, context: RuntimeWebSocketApi) => {
  const cleanup = installWebSocketConnectionHandlers(ws, context);
  let attached = false;
  try {
    context.attachSocket(ws);
    attached = true;
    if (sendManagedEncoded(ws, context, encode({ type: 'state.ready', snapshot: context.snapshot() }))) {
      return true;
    }
    cleanup();
    return false;
  } catch {
    if (attached) {
      context.detachSocket(ws);
    }
    cleanup();
    closeFailedWebSocketInit(ws);
    return false;
  }
};

const installWebSocketConnectionHandlers = (ws: WebSocket, context: RuntimeWebSocketApi) => {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    ws.removeListener('error', handleError);
    ws.removeListener('message', handleMessage);
    ws.removeListener('close', cleanup);
  };
  const handleError = () => {};
  const handleMessage = (raw: WebSocket.RawData) => handleClientMessage(ws, context, raw.toString(), cleanup);
  ws.on('error', handleError);
  ws.on('message', handleMessage);
  ws.on('close', cleanup);
  return cleanup;
};

const handleClientMessage = (
  ws: WebSocket,
  context: RuntimeWebSocketApi,
  raw: string,
  cleanup: () => void
) => {
  try {
    context.handleMessage(ws, decodeClient(raw));
  } catch (error) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!sendManagedEncoded(ws, context, encode({ type: 'error', networkId: null, message: error instanceof Error ? error.message : 'Invalid websocket payload' }))) {
      cleanup();
    }
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

const closeFailedWebSocketInit = (ws: WebSocket) => {
  if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
    return;
  }
  try {
    ws.close(1011, 'WebSocket initialization failed');
  } catch {
    // Ignore close failures while releasing initialization resources.
  }
};
