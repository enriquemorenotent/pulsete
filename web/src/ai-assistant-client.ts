import type {
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
  ask: (bufferId: string, request: AiAssistantRequest) =>
    requestJson<AiAssistantResponse>(
      `/api/buffers/${encodeURIComponent(bufferId)}/assistant`,
      { method: 'POST', body: JSON.stringify(request) },
    ),
  status: () =>
    requestJson<AiAssistantProviderStatus>('/api/assistant/status'),
  login: () =>
    requestJson<AiAssistantLoginResponse>(
      '/api/assistant/login',
      { method: 'POST', body: JSON.stringify({}) },
    ),
};
