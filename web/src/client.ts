import { historySearchLimit, historyWindowLimit } from '../../shared/protocol-chat.js';
import type { ServerMessage } from '../../shared/protocol-messages.js';
import type {
  BufferHistorySearchPayload,
  BufferState,
  ChatMessage,
  FriendState,
  LogHistorySearchFilters,
  LogHistorySearchPayload,
  LogSourceListFilters,
  LogSourceListPayload,
  MutedNickState,
  NetworkProfile,
  NickEmojiState,
} from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import type {
  BufferDraft,
  UserAvatarOverride,
  WorkspacePreferences,
  WorkspacePreferencesPatch,
} from '../../shared/protocol-preferences.js';
import type {
  PagePreviewResponse,
} from '../../shared/protocol-page-preview.js';
import {
  parseDownloadFileName,
  triggerFileDownload,
} from './browser-download.js';

export {
  connectSocket,
  type ClientSocketInstrumentation,
  type SocketHandle,
} from './client-socket.js';

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
  updatePreferences: (patch: WorkspacePreferencesPatch) =>
    apiRequest<{ preferences: WorkspacePreferences; messages: ServerMessage[] }>(
      '/api/preferences',
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
  importLegacyPreferences: (payload: {
    preferences: WorkspacePreferencesPatch;
    avatarOverrides: Array<{
      networkId: string;
      nick: string;
      identity?: NetworkUserIdentity | null;
      dataUrl?: string;
      externalUrl?: string;
    }>;
  }) => apiRequest<{
    imported: boolean;
    skippedAvatarOverrides: number;
    preferences: WorkspacePreferences;
    avatarOverrides: UserAvatarOverride[];
    messages: ServerMessage[];
  }>('/api/preferences/import-legacy', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  saveDraft: (bufferId: string, body: string) =>
    apiRequest<{ draft: BufferDraft | null; messages: ServerMessage[] }>(
      `/api/buffers/${encodeURIComponent(bufferId)}/draft`,
      { method: 'PUT', body: JSON.stringify({ body }) },
    ),
  saveAvatarOverride: (payload: {
    networkId: string;
    nick: string;
    identity?: NetworkUserIdentity | null;
    dataUrl?: string;
    externalUrl?: string;
  }) => apiRequest<{ avatarOverride: UserAvatarOverride; messages: ServerMessage[] }>(
    '/api/user-avatar-overrides',
    { method: 'PUT', body: JSON.stringify(payload) },
  ),
  removeAvatarOverride: (id: string) =>
    apiRequest<{ avatarOverrideId: string; messages: ServerMessage[] }>(
      `/api/user-avatar-overrides/${encodeURIComponent(id)}`,
      { method: 'DELETE', body: '{}' },
    ),
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
  loadHistory: (
    bufferId: string,
    limit = historyWindowLimit,
    beforeMessageId?: string,
    init?: Pick<RequestInit, 'signal'>,
  ) => {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (beforeMessageId) {
      searchParams.set('before', beforeMessageId);
    }
    return apiRequest<BufferHistoryPayload>(
      `/api/buffers/${bufferId}/history?${searchParams.toString()}`,
      { signal: init?.signal },
    );
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
  listLogSources: (
    filters: LogSourceListFilters = {},
    limit = historySearchLimit,
    init?: Pick<RequestInit, 'signal'>,
  ) => {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (filters.q) {
      searchParams.set('q', filters.q);
    }
    if (filters.networkId) {
      searchParams.set('networkId', filters.networkId);
    }
    if (filters.kind) {
      searchParams.set('kind', filters.kind);
    }
    return apiRequest<LogSourceListPayload>(
      `/api/logs/sources?${searchParams.toString()}`,
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
  resolvePagePreview: (
    url: string,
    init?: Pick<RequestInit, 'signal'>,
  ) => apiRequest<PagePreviewResponse>('/api/media/page-preview', {
    method: 'POST',
    body: JSON.stringify({ url }),
    signal: init?.signal,
  }),
};
