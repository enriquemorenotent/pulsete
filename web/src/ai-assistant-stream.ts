import type { AiAssistantProgress, AiAssistantResponse, AiAssistantStreamEvent } from '../../shared/protocol-ai.js';

export async function readAssistantStream(response: Response, onProgress?: (stage: AiAssistantProgress) => void,
  signal?: AbortSignal): Promise<AiAssistantResponse> {
  if (!response.body) throw new Error('Assistant response stream is missing');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const parse = (line: string): AiAssistantResponse | undefined => {
    signal?.throwIfAborted();
    const event = JSON.parse(line) as AiAssistantStreamEvent;
    if (event.type === 'error') throw new Error(event.message);
    if (event.type === 'result') return event.response;
    if (event.type === 'progress') onProgress?.(event.stage);
    else throw new Error('Invalid assistant response');
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        if (!line.trim()) continue;
        const result = parse(line);
        if (result) return result;
      }
      if (pending.length > 4_000_000) throw new Error('Assistant response is too large');
      if (done) {
        if (pending.trim()) { const result = parse(pending); if (result) return result; }
        throw new Error('Assistant connection ended before an answer arrived. Please retry.');
      }
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
