import { serviceUnavailable } from './app-error.js';

export type OpenAiAssistantProvider = {
  model: string | null;
  provider: 'openai-api-key' | 'unavailable';
  request(input: { instructions: string; prompt: string }): Promise<string>;
};

export const defaultAiAssistantModel = 'gpt-5.5';

export const createOpenAiAssistantProvider = (
  env: NodeJS.ProcessEnv = process.env,
): OpenAiAssistantProvider => {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
  const model = env.OPENAI_MODEL?.trim() || defaultAiAssistantModel;
  if (!apiKey) {
    return unavailableProvider(model);
  }
  return {
    model,
    provider: 'openai-api-key',
    request: (input) => requestOpenAiResponse({ ...input, apiKey, model }),
  };
};

const unavailableProvider = (model: string): OpenAiAssistantProvider => ({
  model,
  provider: 'unavailable',
  request: async () => {
    throw serviceUnavailable('OpenAI provider is not connected');
  },
});

const requestOpenAiResponse = async (input: {
  apiKey: string;
  instructions: string;
  model: string;
  prompt: string;
}) => {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: input.prompt,
      instructions: input.instructions,
      model: input.model,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw serviceUnavailable(readOpenAiError(body) ?? 'OpenAI request failed');
  }
  return extractOpenAiText(body) ?? '';
};

const readOpenAiError = (body: unknown) => {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === 'string' ? error.message : null;
};

export const extractOpenAiText = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const outputText = (body as { output_text?: unknown }).output_text;
  if (typeof outputText === 'string') {
    return outputText.trim();
  }
  return extractOutputContentText((body as { output?: unknown }).output).trim() || null;
};

const extractOutputContentText = (output: unknown): string => {
  if (!Array.isArray(output)) {
    return '';
  }
  return output.flatMap((item) => {
    const content = (item as { content?: unknown }).content;
    return Array.isArray(content) ? content.map(readContentText) : [];
  }).filter(Boolean).join('\n');
};

const readContentText = (content: unknown) => {
  const text = (content as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
};
