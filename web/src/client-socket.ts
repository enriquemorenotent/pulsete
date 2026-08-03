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

export type ClientSocketInstrumentation = {
  onClose?: () => void;
  onCreate?: () => void;
  onInvalidReceive?: (payloadCharacters: number) => void;
  onOpen?: () => void;
  onReceive?: (type: ServerMessage['type'], payloadCharacters: number) => void;
  onSend?: (type: ClientMessage['type'], payloadCharacters: number) => void;
};

type WebSocketLocation = Pick<Location, 'host' | 'protocol'>;

export const resolveWebSocketUrl = (
  location: WebSocketLocation,
) => {
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
}: SocketCallbacks, instrumentation?: ClientSocketInstrumentation): SocketHandle => {
  const socket = new WebSocket(resolveWebSocketUrl(window.location));
  instrumentation?.onCreate?.();
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
    instrumentation?.onClose?.();
    onClose?.();
  };
  const closeAndRetireSocket = () => {
    closeSocket(socket);
    retireSocket();
  };
  function handleOpen() {
    if (!closed) {
      instrumentation?.onOpen?.();
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
      instrumentation?.onReceive?.(message.type, payload.length);
      onMessage(message);
    } catch (error) {
      instrumentation?.onInvalidReceive?.(payload.length);
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
        const payload = encode(parsed);
        socket.send(payload);
        instrumentation?.onSend?.(parsed.type, payload.length);
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
