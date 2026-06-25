import { clientMessageSchema, decodeServer, encode } from '../../shared/protocol-messages.js';
import type { ClientMessage, ServerMessage } from '../../shared/protocol-messages.js';
import { gatewaySocketClosedMessage } from './gateway.js';

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  close: () => void;
};

export type SocketCallbacks = {
  onMessage: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

type WebSocketLocation = Pick<Location, 'host' | 'protocol'>;
type PulseteImportMeta = ImportMeta & {
  env?: {
    VITE_PULSETE_WS_ORIGIN?: string;
  };
};

const normalizeWebSocketOrigin = (origin: string) => origin.replace(/\/$/, '');

const resolveConfiguredWebSocketOrigin = () => {
  const origin = (import.meta as PulseteImportMeta).env?.VITE_PULSETE_WS_ORIGIN;
  if (!origin) {
    return null;
  }
  return normalizeWebSocketOrigin(origin);
};

export const resolveWebSocketUrl = (
  location: WebSocketLocation,
  configuredOrigin = resolveConfiguredWebSocketOrigin(),
) => {
  if (configuredOrigin) {
    return `${normalizeWebSocketOrigin(configuredOrigin)}/ws`;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
};

const closeSocket = (socket: WebSocket) => {
  try {
    socket.close();
  } catch {
    // Ignore browser close failures; callers only need the transport retired.
  }
};

export const connectSocket = ({
  onMessage,
  onOpen,
  onClose,
}: SocketCallbacks): SocketHandle => {
  const socket = new WebSocket(resolveWebSocketUrl(window.location));
  let closed = false;

  const cleanup = () => {
    socket.removeEventListener('open', handleOpen);
    socket.removeEventListener('message', handleMessage);
    socket.removeEventListener('close', handleClose);
  };
  const retireSocket = () => {
    if (closed) {
      return;
    }
    closed = true;
    cleanup();
    onClose?.();
  };
  const closeAndRetireSocket = () => {
    closeSocket(socket);
    retireSocket();
  };
  function handleOpen() {
    if (!closed) {
      onOpen?.();
    }
  }
  function handleMessage(event: MessageEvent) {
    if (closed) {
      return;
    }
    const payload = String(event.data);
    try {
      const message = decodeServer(payload);
      onMessage(message);
    } catch (error) {
      console.error('Invalid websocket payload', error);
      closeAndRetireSocket();
    }
  }
  function handleClose() {
    retireSocket();
  }

  socket.addEventListener('open', handleOpen);
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', handleClose);

  return {
    send(message) {
      const parsed = clientMessageSchema.parse(message);
      if (socket.readyState !== WebSocket.OPEN) {
        closeAndRetireSocket();
        throw new Error(gatewaySocketClosedMessage);
      }
      try {
        socket.send(encode(parsed));
      } catch {
        closeAndRetireSocket();
        throw new Error(gatewaySocketClosedMessage);
      }
    },
    close() {
      closeAndRetireSocket();
    },
  };
};
