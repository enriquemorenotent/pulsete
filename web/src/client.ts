import {
  type BufferHistoryImportSummary,
  type BufferHistoryImportRequest,
  type BufferSelfNickAliasesRequest,
  type AssistantTurnAttachmentInput,
  type AssistantPreferences,
  type AssistantTaskKind,
  type AssistantThread,
  type AssistantThreadSummary,
  clientMessageSchema,
  decodeServer,
  encode,
  historyWindowLimit,
  type ClientMessage,
  type ServerMessage,
  type BufferState,
  type FriendState,
  type NetworkProfile,
  type ChatMessage,
} from '../../shared/protocol.js';
import { gatewaySocketClosedMessage } from './gateway.js';

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
      }
    ),
  deleteNetwork: (networkId: string) =>
    apiRequest<{ deletedNetworkIds: string[]; messages: ServerMessage[]; ok: boolean }>(`/api/networks/${networkId}`, {
      method: 'DELETE',
      body: '{}',
    }),
  duplicateNetwork: (networkId: string) =>
    apiRequest<{ messages: ServerMessage[]; network: NetworkProfile; serverBuffer: BufferState | null }>(`/api/networks/${networkId}/duplicate`, {
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
  loadHistory: (bufferId: string, limit = historyWindowLimit, beforeMessageId?: string) => {
    const searchParams = new URLSearchParams({ limit: String(limit) });
    if (beforeMessageId) {
      searchParams.set('before', beforeMessageId);
    }
    return apiRequest<BufferHistoryPayload>(`/api/buffers/${bufferId}/history?${searchParams.toString()}`);
  },
  clearBufferHistory: (bufferId: string) =>
    apiRequest<{ ok: boolean; buffer: BufferState; messages: ServerMessage[] }>(`/api/buffers/${bufferId}/history`, {
      method: 'DELETE',
      body: '{}',
    }),
  importBufferHistory: (bufferId: string, payload: BufferHistoryImportRequest) =>
    apiRequest<{ ok: boolean; messages: ServerMessage[]; summary: BufferHistoryImportSummary }>(
      `/api/buffers/${bufferId}/history/import`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  updateBufferSelfNickAliases: (bufferId: string, payload: BufferSelfNickAliasesRequest) =>
    apiRequest<{ ok: boolean; buffer: BufferState; repairedCount: number; messages: ServerMessage[] }>(
      `/api/buffers/${bufferId}/self-nick-aliases`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
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
  startAssistantChatgptLogin: () =>
    apiRequest<{ loginId: string; authUrl: string }>('/api/assistant/auth/chatgpt/start', {
      method: 'POST',
      body: '{}',
    }),
  cancelAssistantLogin: (loginId: string) =>
    apiRequest<{ ok: boolean }>(`/api/assistant/auth/chatgpt/${encodeURIComponent(loginId)}/cancel`, {
      method: 'POST',
      body: '{}',
    }),
  logoutAssistant: () =>
    apiRequest<{ ok: boolean }>('/api/assistant/logout', {
      method: 'POST',
      body: '{}',
    }),
  saveAssistantPreferences: (payload: Partial<AssistantPreferences>) =>
    apiRequest<{ preferences: AssistantPreferences }>('/api/assistant/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  createAssistantThread: (
    payload: { bufferId: string | null; scope?: AssistantThreadSummary['scope']; task: AssistantTaskKind; model?: string }
  ) =>
    apiRequest<{ thread: AssistantThreadSummary }>('/api/assistant/threads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAssistantThread: (threadId: string) =>
    apiRequest<{ ok: boolean; messages: ServerMessage[] }>(`/api/assistant/threads/${encodeURIComponent(threadId)}`, {
      method: 'DELETE',
      body: '{}',
    }),
  loadAssistantThread: (threadId: string) =>
    apiRequest<{ thread: AssistantThread }>(`/api/assistant/threads/${encodeURIComponent(threadId)}`),
  startAssistantTurn: (
    threadId: string,
    payload: {
      activeBufferId?: string | null;
      clientTurnId?: string;
      prompt: string;
      attachments?: AssistantTurnAttachmentInput[];
    },
  ) =>
    apiRequest<{ ok: boolean; messages?: ServerMessage[] }>(`/api/assistant/threads/${encodeURIComponent(threadId)}/turns`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  interruptAssistantThread: (threadId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/assistant/threads/${encodeURIComponent(threadId)}/interrupt`,
      {
        method: 'POST',
        body: '{}',
      }
    ),
  interruptAssistantTurn: (threadId: string, turnId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/assistant/threads/${encodeURIComponent(threadId)}/interrupt/${encodeURIComponent(turnId)}`,
      {
        method: 'POST',
        body: '{}',
      }
    ),
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
  let closed = false;

  socket.addEventListener('open', () => {
    if (closed) {
      return;
    }
    onOpen?.();
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
