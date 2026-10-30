import { readAssistantStream } from './ai-assistant-stream.js';
import type {
  AiAssistantProgress,
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
  AiAssistantRequest,
  AiAssistantResponse,
} from '../../shared/protocol-ai.js';

const requestJson = async <T>(path: string, init?: RequestInit) => {
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

export const aiAssistantApi = {
  ask: async (bufferId: string, request: AiAssistantRequest, signal?: AbortSignal,
    onProgress?: (stage: AiAssistantProgress) => void): Promise<AiAssistantResponse> => {
    const response = await fetch(`/api/buffers/${encodeURIComponent(bufferId)}/assistant`, {
      method: 'POST', body: JSON.stringify(request), signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    });
    if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message ?? `Request failed (${response.status})`); }
    if (response.headers.get('content-type')?.includes('application/x-ndjson')) return readAssistantStream(response, onProgress, signal);
    return response.json();
  },
  clear: (bufferId: string, continuationToken: string) => requestJson(`/api/buffers/${encodeURIComponent(bufferId)}/assistant`, {
    method: 'DELETE', body: JSON.stringify({ continuationToken }),
  }),
  status: () =>
    requestJson<AiAssistantProviderStatus>('/api/assistant/status'),
  login: () =>
    requestJson<AiAssistantLoginResponse>(
      '/api/assistant/login',
      { method: 'POST', body: JSON.stringify({}) },
    ),
};
