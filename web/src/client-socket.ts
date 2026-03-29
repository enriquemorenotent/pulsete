import {
  clientMessageSchema,
  decodeServer,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '../../shared/protocol.js';
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
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  let closed = false;

  socket.addEventListener('open', () => {
    if (!closed) {
      onOpen?.();
    }
  });
  socket.addEventListener('message', (event) => {
    if (closed) {
      return;
    }
    try {
      onMessage(decodeServer(String(event.data)));
    } catch (error) {
      console.error('Invalid websocket payload', error);
      closeSocket(socket);
    }
  });
  socket.addEventListener('close', () => {
    if (closed) {
      return;
    }
    closed = true;
    onClose?.();
  });

  return {
    send(message) {
      const parsed = clientMessageSchema.parse(message);
      if (socket.readyState !== WebSocket.OPEN) {
        closeSocket(socket);
        throw new Error(gatewaySocketClosedMessage);
      }
      try {
        socket.send(encode(parsed));
      } catch {
        closeSocket(socket);
        throw new Error(gatewaySocketClosedMessage);
      }
    },
    close() {
      closeSocket(socket);
    },
  };
};
