import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer } from 'ws';
import { decodeClient, encode } from '../shared/protocol-messages.js';
import type { RuntimeWebSocketApi } from './runtime.js';
import { jsonBodyLimitBytes, tryParseRequestUrl } from './http-utils.js';
import type { LaunchAuthentication } from './launch-authentication.js';
import {
  createRequestOriginPolicy,
  type RequestOriginPolicy,
} from './request-origin-policy.js';

export type WebSocketServerOptions = {
  authentication?: LaunchAuthentication;
  originPolicy?: RequestOriginPolicy;
};

export const attachWebSocketServer = (
  server: Server,
  context: RuntimeWebSocketApi,
  options: WebSocketServerOptions = {},
) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: jsonBodyLimitBytes });
  const originPolicy = options.originPolicy ?? createRequestOriginPolicy();
  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = tryParseRequestUrl(req.url);
    if (!url || url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (!originPolicy.allows(req.headers.origin)) {
      rejectUpgrade(socket, 403, 'Origin not allowed');
      return;
    }
    if (options.authentication && !options.authentication.authenticate(req)) {
      rejectUpgrade(socket, 401, 'Authentication required');
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

const rejectUpgrade = (socket: Duplex, status: 401 | 403, message: string) => {
  const body = `${message}\n`;
  const statusText = status === 401 ? 'Unauthorized' : 'Forbidden';
  socket.end([
    `HTTP/1.1 ${status} ${statusText}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(body)}`,
    '',
    body,
  ].join('\r\n'));
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
