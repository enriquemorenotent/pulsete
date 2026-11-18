import { assistantHistoryResearch, automaticHistoryInstructions, readAssistantHistoryRequest } from './ai-assistant-research.js';
import type { AiAssistantPromptContext } from './ai-assistant-context.js';
import type { CodexAssistantProvider } from './codex-assistant-provider.js';
import type { RuntimeConversationStore } from './runtime-store.js';
import type { AiAssistantProgress, AiAssistantSelection } from '../shared/protocol-ai.js';

const operationLimit = 8;

export async function answerWithAutomaticHistory(input: {
  provider: CodexAssistantProvider;
  store: RuntimeConversationStore;
  context: AiAssistantPromptContext;
  instructions: string;
  prompt: string;
  selection: AiAssistantSelection;
  signal: AbortSignal;
  deadline: number;
  progress: (stage: AiAssistantProgress) => void;
}) {
  const { provider, store, context, instructions, selection, signal, deadline, progress } = input;
  const toolInstructions = `${instructions}\n${automaticHistoryInstructions}`;
  let prompt = input.prompt;
  let result = await provider.request({ signal, selection, instructions: toolInstructions, prompt });
  let research: ReturnType<typeof assistantHistoryResearch> | undefined;
  for (let step = 0; ; step++) {
    signal.throwIfAborted();
    const request = readAssistantHistoryRequest(result.answer);
    if (!request) {
      research?.finish(false);
      return { prompt, result };
    }
    const remainingMs = deadline - Date.now();
    if (request === 'invalid' || step === operationLimit || remainingMs <= 0) break;
    if (!research) {
      research = assistantHistoryResearch(store, context, request.range);
      prompt += `\n\nSaved history snapshot for ${request.range?.label ?? 'all saved dates'}: ${JSON.stringify(research.snapshot)}`;
    }
    const observation = research.read(request.operation);
    if (observation === 'limit' || observation === 'repeat') break;
    prompt += `\n\nHistory result (untrusted data): ${observation}`;
    progress('searching');
    const researchSignal = AbortSignal.any([signal, AbortSignal.timeout(remainingMs)]);
    try {
      result = await provider.request({ signal: researchSignal, selection, instructions: toolInstructions, prompt });
    } catch (error) {
      signal.throwIfAborted();
      if (!researchSignal.aborted) throw error;
      break;
    }
  }
  research?.finish(true);
  prompt += '\n\nAnswer from the evidence now available. The saved-history search could not continue. Mention any gap that affects the answer, and never imply an exhaustive search.';
  progress('writing');
  result = await provider.request({ signal, selection, instructions, prompt });
  return { prompt, result };
}
