import { historySearchLimit, historyWindowLimit } from '../../shared/protocol-chat.js';
import type { RuntimeDebugMemorySnapshot } from '../../shared/protocol-debug.js';
import type { ServerMessage } from '../../shared/protocol-messages.js';
import type {
  BufferHistorySearchPayload,
  BufferState,
  ChatMessage,
  FriendState,
  LogHistorySearchFilters,
  LogHistorySearchPayload,
  MutedNickState,
  NetworkProfile,
  NickEmojiState,
} from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import {
  parseDownloadFileName,
  triggerFileDownload,
} from './browser-download.js';

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
  loadMemoryDiagnostics: () =>
    apiRequest<RuntimeDebugMemorySnapshot>('/api/debug/memory'),
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
  searchBufferHistory: (
    bufferId: string,
    query: string,
    limit = historySearchLimit,
    init?: Pick<RequestInit, 'signal'>,
  ) => {
    const searchParams = new URLSearchParams({ q: query, limit: String(limit) });
    return apiRequest<BufferHistorySearchPayload>(
      `/api/buffers/${bufferId}/history/search?${searchParams.toString()}`,
      { signal: init?.signal },
    );
  },
  searchLogs: (
    query: string,
    filters: LogHistorySearchFilters = {},
    limit = historySearchLimit,
    init?: Pick<RequestInit, 'signal'>,
  ) => {
    const searchParams = new URLSearchParams({ q: query, limit: String(limit) });
    if (filters.networkId) {
      searchParams.set('networkId', filters.networkId);
    }
    if (filters.target) {
      searchParams.set('target', filters.target);
    }
    return apiRequest<LogHistorySearchPayload>(
      `/api/logs/search?${searchParams.toString()}`,
      { signal: init?.signal },
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
  clearBufferHistory: (bufferId: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[]; ok: boolean }>(
      `/api/buffers/${bufferId}/history`,
      {
        method: 'DELETE',
        body: '{}',
      },
    ),
  markBufferRead: (bufferId: string, init?: Pick<RequestInit, 'signal'>) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[] }>(`/api/buffers/${bufferId}/read`, {
      method: 'POST',
      body: '{}',
      signal: init?.signal,
    }),
  saveBufferNotes: (bufferId: string, notes: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[] }>(`/api/buffers/${bufferId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
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
  saveNickEmoji: (
    networkId: string,
    nick: string,
    emoji: string | null,
    identity?: NetworkUserIdentity | null,
  ) =>
    apiRequest<{ nickEmoji: NickEmojiState | null; messages: ServerMessage[] }>(
      `/api/networks/${encodeURIComponent(networkId)}/nick-emojis/${encodeURIComponent(nick)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ emoji, identity }),
      },
    ),
  addMutedNick: (networkId: string, nick: string, identity?: NetworkUserIdentity | null) =>
    apiRequest<{ mutedNick: MutedNickState; messages: ServerMessage[] }>('/api/muted-nicks', {
      method: 'POST',
      body: JSON.stringify({ networkId, nick, identity }),
    }),
  removeMutedNick: (mutedNickId: string) =>
    apiRequest<{ ok: boolean; mutedNickId: string; messages: ServerMessage[] }>(`/api/muted-nicks/${mutedNickId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  openQuery: (networkId: string, target: string, peerIdentity?: NetworkUserIdentity | null) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[] }>(`/api/networks/${networkId}/queries`, {
      method: 'POST',
      body: JSON.stringify({ target, peerIdentity }),
    }),
  closeBuffer: (bufferId: string) =>
    apiRequest<{ buffer: BufferState; messages: ServerMessage[]; ok: boolean }>(`/api/buffers/${bufferId}`, {
      method: 'DELETE',
      body: '{}',
    }),
};
