import {
  clientMessageSchema,
  decodeServer,
  encode,
  historyWindowLimit,
  type ClientMessage,
  type ServerMessage,
  type AppSnapshot,
  type BufferState,
  type FriendState,
  type NetworkProfile,
  type ChatMessage,
} from '../../shared/protocol.js';
import { gatewaySocketClosedMessage } from './gateway.js';

const apiRequest = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
};

export const api = {
  snapshot: () => apiRequest<AppSnapshot>('/api/snapshot'),
  saveNetwork: (payload: Partial<NetworkProfile> & { clearPassword?: boolean; id?: string; password?: string }) =>
    apiRequest<{ network: NetworkProfile; serverBuffer: BufferState | null }>(
      payload.id ? `/api/networks/${payload.id}` : '/api/networks',
      {
      method: payload.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
      }
    ),
  deleteNetwork: (networkId: string) =>
    apiRequest<{ ok: boolean; deletedNetworkIds: string[] }>(`/api/networks/${networkId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  duplicateNetwork: (networkId: string) =>
    apiRequest<{ network: NetworkProfile; serverBuffer: BufferState | null }>(`/api/networks/${networkId}/duplicate`, {
      method: 'POST',
      body: '{}',
    }),
  connectNetwork: (networkId: string) =>
    apiRequest<{ ok: boolean }>(`/api/networks/${networkId}/connect`, {
      method: 'POST',
      body: '{}',
    }),
  disconnectNetwork: (networkId: string) =>
    apiRequest<{ ok: boolean }>(`/api/networks/${networkId}/disconnect`, {
      method: 'POST',
      body: '{}',
    }),
  loadHistory: (bufferId: string, limit = historyWindowLimit) =>
    apiRequest<{ messages: ChatMessage[] }>(`/api/buffers/${bufferId}/history?limit=${limit}`),
  markBufferRead: (bufferId: string) =>
    apiRequest<{ buffer: BufferState }>(`/api/buffers/${bufferId}/read`, {
      method: 'POST',
      body: '{}',
    }),
  addFriend: (nick: string) =>
    apiRequest<{ friend: FriendState }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ nick }),
    }),
  removeFriend: (friendId: string) =>
    apiRequest<{ ok: boolean }>(`/api/friends/${friendId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  openQuery: (networkId: string, target: string) =>
    apiRequest<{ buffer: BufferState }>(`/api/networks/${networkId}/queries`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  openChannel: (networkId: string, channel: string, sourceBufferId?: string) =>
    apiRequest<{ buffer: BufferState }>(`/api/networks/${networkId}/channels`, {
      method: 'POST',
      body: JSON.stringify({ channel, sourceBufferId }),
    }),
  closeBuffer: (bufferId: string) =>
    apiRequest<{ ok: boolean }>(`/api/buffers/${bufferId}`, {
      method: 'DELETE',
      body: '{}',
    }),
};

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  close: () => void;
};

type SocketCallbacks = {
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

export const connectSocket = ({ onMessage, onOpen, onClose }: SocketCallbacks): SocketHandle => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener('open', () => {
    onOpen?.();
  });

  socket.addEventListener('message', (event) => {
    try {
      onMessage(decodeServer(String(event.data)));
    } catch (error) {
      console.error('Invalid websocket payload', error);
    }
  });

  socket.addEventListener('close', () => {
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
