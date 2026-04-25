import {
  historySearchLimit,
  historyWindowLimit,
  type ServerMessage,
  type BufferState,
  type BufferHistorySearchPayload,
  type FriendState,
  type MutedNickState,
  type NetworkProfile,
  type ChatMessage,
} from '../../shared/protocol.js';

export { connectSocket, type SocketHandle } from './client-socket.js';

export type BufferHistoryPayload = {
  messages: ChatMessage[];
  hasMore: boolean;
};

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
  saveNetwork: (payload: Partial<NetworkProfile> & { clearPassword?: boolean; id?: string; password?: string }) =>
    apiRequest<{ messages: ServerMessage[]; network: NetworkProfile; serverBuffer: BufferState | null }>(
      payload.id ? `/api/networks/${payload.id}` : '/api/networks',
      {
        method: payload.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteNetwork: (networkId: string) =>
    apiRequest<{ deletedNetworkIds: string[]; messages: ServerMessage[]; ok: boolean }>(`/api/networks/${networkId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  closeConnection: (networkId: string) =>
    apiRequest<{ messages: ServerMessage[]; network: NetworkProfile; ok: boolean }>(`/api/networks/${networkId}/close`, {
      method: 'POST',
      body: '{}',
    }),
  duplicateNetwork: (networkId: string) =>
    apiRequest<{ messages: ServerMessage[]; network: NetworkProfile; serverBuffer: BufferState | null }>(
      `/api/networks/${networkId}/duplicate`,
      {
        method: 'POST',
        body: '{}',
      },
    ),
  connectNetwork: (networkId: string) =>
    apiRequest<{ messages: ServerMessage[]; network: NetworkProfile; ok: boolean; serverBuffer: BufferState | null }>(
      `/api/networks/${networkId}/connect`,
      {
        method: 'POST',
        body: '{}',
      },
    ),
  disconnectNetwork: (networkId: string) =>
    apiRequest<{ messages: ServerMessage[]; ok: boolean }>(`/api/networks/${networkId}/disconnect`, {
      method: 'POST',
      body: '{}',
    }),
  loadHistory: (bufferId: string, limit = historyWindowLimit, beforeMessageId?: string) => {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (beforeMessageId) {
      searchParams.set('before', beforeMessageId);
    }
    return apiRequest<BufferHistoryPayload>(`/api/buffers/${bufferId}/history?${searchParams.toString()}`);
  },
  searchBufferHistory: (bufferId: string, query: string, limit = historySearchLimit) => {
    const searchParams = new URLSearchParams({ q: query, limit: String(limit) });
    return apiRequest<BufferHistorySearchPayload>(
      `/api/buffers/${bufferId}/history/search?${searchParams.toString()}`,
    );
  },
  downloadBufferHistory: async (bufferId: string) => {
    const response = await fetch(`/api/buffers/${bufferId}/history/download`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message ?? `Request failed (${response.status})`);
    }
    const blob = await response.blob();
    const fileName = parseDownloadFileName(response.headers.get('Content-Disposition'))
      ?? `history-${bufferId}.txt`;
    triggerFileDownload(blob, fileName);
  },
  markBufferRead: (bufferId: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[] }>(`/api/buffers/${bufferId}/read`, {
      method: 'POST',
      body: '{}',
    }),
  addFriend: (nick: string) =>
    apiRequest<{ friend: FriendState; messages: ServerMessage[] }>('/api/friends', {
      method: 'POST',
      body: JSON.stringify({ nick }),
    }),
  removeFriend: (friendId: string) =>
    apiRequest<{ ok: boolean; friendId: string; messages: ServerMessage[] }>(`/api/friends/${friendId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  addMutedNick: (networkId: string, nick: string) =>
    apiRequest<{ mutedNick: MutedNickState; messages: ServerMessage[] }>('/api/muted-nicks', {
      method: 'POST',
      body: JSON.stringify({ networkId, nick }),
    }),
  removeMutedNick: (mutedNickId: string) =>
    apiRequest<{ ok: boolean; mutedNickId: string; messages: ServerMessage[] }>(`/api/muted-nicks/${mutedNickId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  openQuery: (networkId: string, target: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[] }>(`/api/networks/${networkId}/queries`, {
      method: 'POST',
      body: JSON.stringify({ target }),
    }),
  closeBuffer: (bufferId: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[]; ok: boolean }>(`/api/buffers/${bufferId}`, {
      method: 'DELETE',
      body: '{}',
    }),
};

const parseDownloadFileName = (contentDisposition: string | null) => {
  const match = contentDisposition?.match(/filename="([^"]+)"/i) ?? contentDisposition?.match(/filename=([^;]+)/i);
  return match?.[1]?.trim() || null;
};

const triggerFileDownload = (blob: Blob, fileName: string) => {
  if (typeof document === 'undefined') {
    throw new Error('Downloads require a browser context');
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body?.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};
