import { badRequest } from './app-error.js';
import {
  buildAiAssistantContext,
  renderAiAssistantMessages,
} from './ai-assistant-context.js';
import { createOpenAiAssistantProvider } from './openai-assistant-provider.js';
import type {
  AiAssistantProviderStatus,
  AiAssistantRequest,
  AiAssistantResponse,
} from '../shared/protocol-ai.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { OpenAiAssistantProvider } from './openai-assistant-provider.js';

type RuntimeAiAssistantServiceOptions = {
  conversations: RuntimeConversationStore;
  provider?: OpenAiAssistantProvider;
};

export class RuntimeAiAssistantService {
  private readonly provider: OpenAiAssistantProvider;

  constructor(private readonly options: RuntimeAiAssistantServiceOptions) {
    this.provider = options.provider ?? createOpenAiAssistantProvider();
  }

  status(): AiAssistantProviderStatus {
    return {
      connected: this.provider.provider !== 'unavailable',
      detail: this.provider.provider === 'unavailable'
        ? 'Set OPENAI_API_KEY to enable assistant requests'
        : 'OpenAI API key configured',
      model: this.provider.model,
      provider: this.provider.provider,
    };
  }

  async ask(bufferId: string, request: AiAssistantRequest): Promise<AiAssistantResponse> {
    const context = buildAiAssistantContext(this.options.conversations, bufferId);
    const prompt = request.prompt.trim();
    if (request.mode === 'answer' && !prompt) {
      throw badRequest('Assistant prompt is required');
    }
    const answer = await this.provider.request({
      instructions: buildInstructions(request.mode),
      prompt: buildPrompt({ context, prompt }),
    });
    return { answer, context, mode: request.mode, status: this.status() };
  }
}

const buildInstructions = (mode: AiAssistantRequest['mode']) =>
  [
    'You help the IRC client user understand or respond to the selected conversation.',
    'Use only the provided conversation context. If the context is insufficient, say that plainly.',
    mode === 'suggest-reply'
      ? 'Write one concise message the user could send next. Do not add analysis.'
      : 'Answer concisely and mention uncertainty when needed.',
  ].join('\n');

const buildPrompt = (input: {
  context: ReturnType<typeof buildAiAssistantContext>;
  prompt: string;
}) => [
  `Conversation: ${input.context.buffer.target} (${input.context.buffer.kind})`,
  'Recent saved messages:',
  renderAiAssistantMessages(input.context.messages) || '(none)',
  input.prompt ? `User request: ${input.prompt}` : 'User request: Suggest a reply.',
].join('\n\n');
