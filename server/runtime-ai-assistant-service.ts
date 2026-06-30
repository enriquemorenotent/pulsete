import { badRequest } from './app-error.js';
import {
  buildAiAssistantContext,
  renderAiAssistantContext,
  toPublicAiAssistantContext,
} from './ai-assistant-context.js';
import { createCodexAssistantProvider } from './codex-assistant-provider.js';
import type {
  AiAssistantLoginResponse,
  AiAssistantProviderStatus,
  AiAssistantRequest,
  AiAssistantResponse,
  AiAssistantTurn,
} from '../shared/protocol-ai.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { CodexAssistantProvider } from './codex-assistant-provider.js';

type RuntimeAiAssistantServiceOptions = {
  conversations: RuntimeConversationStore;
  provider?: CodexAssistantProvider;
};

export class RuntimeAiAssistantService {
  private readonly provider: CodexAssistantProvider;

  constructor(private readonly options: RuntimeAiAssistantServiceOptions) {
    this.provider = options.provider ?? createCodexAssistantProvider();
  }

  status(): Promise<AiAssistantProviderStatus> {
    return this.provider.status();
  }

  startLogin(): Promise<AiAssistantLoginResponse> {
    return this.provider.startLogin();
  }

  async ask(bufferId: string, request: AiAssistantRequest): Promise<AiAssistantResponse> {
    const prompt = request.prompt.trim();
    if (request.mode === 'answer' && !prompt) {
      throw badRequest('Assistant prompt is required');
    }
    const context = buildAiAssistantContext(this.options.conversations, bufferId, {
      assistantTurns: request.assistantTurns,
      mode: request.mode,
      prompt,
    });
    const answer = await this.provider.request({
      instructions: buildInstructions(request.mode),
      prompt: buildPrompt({ assistantTurns: request.assistantTurns, context, prompt }),
    });
    return {
      answer,
      context: toPublicAiAssistantContext(context),
      mode: request.mode,
      status: await this.status(),
    };
  }
}

const buildInstructions = (mode: AiAssistantRequest['mode']) =>
  [
    'You help the IRC client user understand or respond to the selected conversation.',
    'Use only the provided conversation context sections.',
    'Use the assistant conversation so far to resolve follow-up questions and clarifications like "I mean".',
    'Recent messages are always present. Search results and full log are included when older context may matter.',
    'If a full saved log section is present, treat it as complete for that conversation.',
    mode === 'suggest-reply'
      ? 'Write one concise message the user could send next. Do not add analysis.'
      : 'Answer concisely and mention uncertainty when needed.',
  ].join('\n');

const buildPrompt = (input: {
  assistantTurns: readonly AiAssistantTurn[];
  context: ReturnType<typeof buildAiAssistantContext>;
  prompt: string;
}) => [
  renderAssistantTurns(input.assistantTurns),
  renderAiAssistantContext(input.context),
  input.prompt ? `User request: ${input.prompt}` : 'User request: Suggest a reply.',
].filter(Boolean).join('\n\n');

const renderAssistantTurns = (turns: readonly AiAssistantTurn[]) =>
  turns.length === 0
    ? ''
    : [
        'Assistant conversation so far:',
        ...turns.map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`),
      ].join('\n');
