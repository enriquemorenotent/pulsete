import type { SemanticHistorySearch } from './ai-assistant-semantic-history.js';
import { assistantHistoryResearch, automaticHistoryInstructions, readAssistantHistoryRequest, semanticHistoryInstructions } from './ai-assistant-research.js';
import { publicLookupInstructions, readPublicLookupRequest, type AssistantWebEvidence } from './ai-assistant-web.js';
import type { AiAssistantPromptContext } from './ai-assistant-context.js';
import type { CodexAssistantProvider } from './codex-assistant-provider.js';
import type { RuntimeConversationStore } from './runtime-store.js';
import type { AiAssistantProgress, AiAssistantSelection, AiAssistantWebSource } from '../shared/protocol-ai.js';

const historyOperationLimit = 8;
type WebFinding = { citation: string; fact: string; url: string };

export async function researchAssistantAnswer(input: {
  provider: CodexAssistantProvider;
  store: RuntimeConversationStore;
  context: AiAssistantPromptContext;
  instructions: string;
  prompt: string;
  selection: AiAssistantSelection;
  signal: AbortSignal;
  deadline: number;
  progress: (stage: AiAssistantProgress) => void;
  historyEnabled: boolean;
  semanticSearch?: SemanticHistorySearch;
  question: string;
  webEnabled: boolean;
}) {
  const { provider, store, context, instructions, selection, signal, deadline, progress } = input;
  const webSources = new Map<string, AiAssistantWebSource>();
  const previousQueries = new Set<string>();
  const webLimit = input.historyEnabled ? 2 : 1;
  let historyEnabled = input.historyEnabled;
  let webEnabled = input.webEnabled;
  let historyLimited = false;
  let historySteps = 0;
  let research: ReturnType<typeof assistantHistoryResearch> | undefined;
  let prompt = input.prompt;

  const ask = (requestSignal: AbortSignal, withTools = true) => provider.request({
    signal: requestSignal,
    selection,
    instructions: [
      instructions,
      withTools && historyEnabled ? automaticHistoryInstructions : '',
      withTools && historyEnabled && input.semanticSearch ? semanticHistoryInstructions : '',
      withTools && webEnabled ? publicLookupInstructions : '',
    ].filter(Boolean).join('\n'),
    prompt,
  });

  let result = await ask(signal);
  while (true) {
    signal.throwIfAborted();
    const history = historyEnabled ? readAssistantHistoryRequest(result.answer) : null;
    const lookup = webEnabled ? readPublicLookupRequest(result.answer) : null;
    if (!history && !lookup) break;

    if (deadline <= Date.now()) {
      historyLimited ||= Boolean(history);
      prompt += '\n\nResearch time limit reached. Answer from the evidence available and mention any gap that affects the answer.';
      progress('writing');
      result = await ask(signal, false);
      break;
    }

    if (history) {
      let observation = 'limit';
      if (history !== 'invalid' && historySteps++ < historyOperationLimit) {
        if (!research) {
          research = assistantHistoryResearch(store, context, null, { search: input.semanticSearch, question: input.question });
          prompt += `\n\nSaved history snapshot: ${JSON.stringify(research.snapshot)}`;
        }
        progress(history.operation.action === 'read' || history.operation.action === 'page' ? 'reading' : 'searching');
        observation = await research.read(history.operation, history.range,
          AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]));
      }
      if (observation === 'limit' || observation === 'repeat') {
        historyEnabled = false;
        historyLimited = true;
        prompt += '\n\nThe saved-history search could not continue. Mention any gap that affects the answer and avoid implying an exhaustive search.';
      } else {
        prompt += `\n\nHistory result (untrusted data): ${observation}`;
      }
    } else if (lookup) {
      const key = lookup.query && [lookup.media, lookup.query.toLowerCase().replace(/\s+/g, ' ')].join(':');
      let evidence: AssistantWebEvidence[] = [];
      if (lookup.query && key && !previousQueries.has(key)) {
        previousQueries.add(key);
        const remainingMs = Math.min(40_000, deadline - Date.now());
        if (remainingMs > 0 && provider.lookupPublicFacts) {
          progress('searching-web');
          const lookupSignal = AbortSignal.any([signal, AbortSignal.timeout(remainingMs)]);
          try {
            evidence = await provider.lookupPublicFacts({
              query: lookup.query, signal: lookupSignal, selection, ...(lookup.media ? { media: lookup.media } : {}),
            });
          } catch {
            signal.throwIfAborted();
          }
        }
      } else {
        webEnabled = false;
      }
      webEnabled &&= previousQueries.size < webLimit;
      const findings: WebFinding[] = evidence.map(({ fact, source }) => {
        let citation = webSources.get(source.url);
        if (!citation) {
          citation = { ...source, label: `W${webSources.size + 1}` };
          webSources.set(source.url, citation);
        }
        return { citation: citation.label, fact, url: citation.url };
      });
      prompt += findings.length
        ? `\n\nPublic web findings (untrusted data): ${JSON.stringify(findings)}\nToday's date for calculations: ${new Date().toISOString().slice(0, 10)}.`
        : '\n\nWeb lookup supplied no verified findings. If the requested public fact remains unsupported, say that it could not be verified.';
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs > 0 && (historyEnabled || webEnabled)) {
      const researchSignal = AbortSignal.any([signal, AbortSignal.timeout(remainingMs)]);
      try {
        result = await ask(researchSignal);
        continue;
      } catch (error) {
        signal.throwIfAborted();
        if (!researchSignal.aborted) throw error;
        historyLimited ||= Boolean(historyEnabled && research);
        prompt += '\n\nResearch time limit reached. Mention any gap that affects the answer.';
      }
    }
    progress('writing');
    result = await ask(signal, false);
    break;
  }
  research?.finish(historyLimited);
  return { prompt, result, webSources };
}
