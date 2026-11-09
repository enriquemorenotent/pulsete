import { requestJson, requestResponse, readJsonResponse } from './api-request.js';
import { readAssistantStream } from './ai-assistant-stream.js';
import type {
  AiAssistantProgress,
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
  AiAssistantRequest,
  AiAssistantResponse,
} from '../../shared/protocol-ai.js';

export const aiAssistantApi = {
  ask: async (bufferId: string, request: AiAssistantRequest, signal?: AbortSignal,
    onProgress?: (stage: AiAssistantProgress) => void): Promise<AiAssistantResponse> => {
    const response = await requestResponse(`/api/buffers/${encodeURIComponent(bufferId)}/assistant`, {
      method: 'POST', body: JSON.stringify(request), signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    });
    if (response.headers.get('content-type')?.includes('application/x-ndjson')) return readAssistantStream(response, onProgress, signal);
    return readJsonResponse<AiAssistantResponse>(response);
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
