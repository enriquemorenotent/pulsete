import {
  clientMessageSchema,
  decodeServer,
  encode,
  historyWindowLimit,
  type ClientMessage,
  type ServerMessage,
  type AppSnapshot,
  type NetworkProfile,
  type ChatMessage,
} from '../../shared/protocol.js';

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
    apiRequest<{ network: NetworkProfile }>(payload.id ? `/api/networks/${payload.id}` : '/api/networks', {
      method: payload.id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    }),
  deleteNetwork: (networkId: string) =>
    apiRequest<{ ok: boolean; deletedNetworkIds: string[] }>(`/api/networks/${networkId}`, {
      method: 'DELETE',
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
  loadHistory: (networkId: string, target: string, limit = historyWindowLimit) =>
    apiRequest<{ messages: ChatMessage[] }>(
      `/api/networks/${networkId}/history?target=${encodeURIComponent(target)}&limit=${limit}`
    ),
  markChannelRead: (channelId: string) =>
    apiRequest<{ ok: boolean }>(`/api/channels/${channelId}/read`, {
      method: 'POST',
      body: '{}',
    }),
  openQuery: (networkId: string, target: string) =>
    apiRequest<{ query: { id: string; networkId: string; target: string } }>(`/api/networks/${networkId}/queries`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  closeQuery: (networkId: string, target: string) =>
    apiRequest<{ ok: boolean }>(`/api/networks/${networkId}/queries/${encodeURIComponent(target)}`, {
      method: 'DELETE',
      body: '{}',
    }),
};

export type SocketHandle = {
  send: (message: ClientMessage) => void;
  close: () => void;
};

export const connectSocket = (onMessage: (message: ServerMessage) => void, onClose?: () => void): SocketHandle => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

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
      socket.send(encode(parsed));
    },
    close() {
      socket.close();
    },
  };
};
