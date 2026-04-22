import type { AssistantTurn } from '../shared/protocol.js';
import type { RawThreadItem, RawTurn } from './assistant-service-shared.js';

export type AssistantActionContext = {
  networkId: string | null;
  networkName: string | null;
  personaNote: string;
};

export type AssistantResolvedAction =
  | { kind: 'none' }
  | { kind: 'clarify'; message: string }
  | { kind: 'persona.set'; note: string }
  | { kind: 'persona.append'; note: string }
  | { kind: 'persona.clear' }
  | { kind: 'persona.rewrite'; instruction: string };

export type AssistantPendingAction =
  | { phase: 'resolve'; context: AssistantActionContext }
  | { phase: 'rewrite'; context: AssistantActionContext; action: Extract<AssistantResolvedAction, { kind: 'persona.rewrite' }> };

export type AssistantStateMutation = {
  kind: 'persona.note.save';
  networkId: string;
  note: string;
};

export const assistantActionResolverOutputSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string' },
    note: { type: 'string' },
    instruction: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['kind'],
  additionalProperties: false,
} as const;

const explicitPersonaCommandPattern = /^\/persona\b/i;
const personaSurfacePattern = /\bpersona(?:\s+notes?)?\b/i;
const actionVerbPattern =
  /\b(?:set|update|change|replace|save|remember|append|add|edit|include|put|clear|remove|delete|erase|reset|rewrite|reword|rephrase|reformat|format|organize|tidy|clean\s+up|polish|improve)\b/i;
const referentialPattern = /\b(?:that|this|it|them|those|these)\b/i;
const personaContextPattern =
  /\bpersona(?:\s+notes?)?\b|\bcurrent note:\b|\b(?:corrected|updated|full)\s+persona(?:\s+note)?\s+should\s+be:\b|\b(?:added that to|updated|cleared)\s+your\s+persona\s+note\b/i;

export const shouldResolveAssistantAction = ({
  prompt,
  priorTurns = [],
}: {
  prompt: string;
  priorTurns?: AssistantTurn[];
}) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return false;
  }
  if (explicitPersonaCommandPattern.test(trimmed) || personaSurfacePattern.test(trimmed)) {
    return true;
  }
  return actionVerbPattern.test(trimmed)
    && referentialPattern.test(trimmed)
    && hasRecentPersonaContext(priorTurns);
};

export const buildAssistantActionResolverInput = ({
  context,
  priorTranscript,
  prompt,
}: {
  context: AssistantActionContext;
  priorTranscript: string;
  prompt: string;
}) => [
  'Task: Decide whether the latest user request should be handled as an assistant-managed saved-state action.',
  'Available actions:',
  '- none',
  '- clarify',
  '- persona.set',
  '- persona.append',
  '- persona.clear',
  '- persona.rewrite',
  'Rules:',
  '- Only use persona.* actions for changes to the saved persona note for the selected network.',
  '- Use none for ordinary chat, transcript questions, or persona questions that do not request a saved change.',
  '- Use clarify when the user clearly wants to change the saved persona note but the request is too ambiguous to save safely.',
  '- Use persona.append by default when the user is adding details.',
  '- Use persona.set only when the user explicitly wants to replace the whole saved note, or when recent thread context clearly contains a full corrected persona note they now want applied.',
  '- Use persona.clear only when the user clearly wants the saved persona note removed.',
  '- Use persona.rewrite when the user wants the current saved persona note rewritten, reformatted, or organized without changing its facts.',
  '- Use recent thread context to resolve references like "that", "them", or "add it now".',
  '- For clarify, include one short user-facing message in the "message" field.',
  '- For persona.set and persona.append, return the full note text to save or append in the "note" field.',
  '- For persona.rewrite, return the rewrite instruction only in the "instruction" field, not the rewritten note.',
  '- Return JSON only.',
  `Selected network: ${context.networkName ?? '(none selected)'}`,
  `Current saved persona note:\n${context.personaNote || '(empty persona note)'}`,
  priorTranscript.trim()
    ? `Recent assistant thread transcript:\n${priorTranscript}`
    : 'Recent assistant thread transcript:\n(none)',
  `Latest user request:\n${prompt.trim() || '(empty request)'}`,
].join('\n\n');

export const parseAssistantResolvedAction = (
  turn: RawTurn,
): AssistantResolvedAction | null => {
  const lastAgentMessage = [...turn.items]
    .reverse()
    .find((item): item is Extract<RawThreadItem, { type: 'agentMessage' }> => item.type === 'agentMessage');
  if (!lastAgentMessage || !lastAgentMessage.text.trim()) {
    return null;
  }
  return parseAssistantResolvedActionText(lastAgentMessage.text);
};

export const parseAssistantResolvedActionText = (
  text: string,
): AssistantResolvedAction | null => {
  const normalized = normalizeStructuredText(text);
  if (!normalized) {
    return null;
  }
  let parsed: { kind?: unknown; note?: unknown; instruction?: unknown; message?: unknown };
  try {
    parsed = JSON.parse(normalized) as { kind?: unknown; note?: unknown; instruction?: unknown; message?: unknown };
  } catch {
    return null;
  }
  const kind = normalizeResolvedActionKind(parsed.kind);
  if (!kind) {
    return null;
  }
  if (kind === 'none' || kind === 'persona.clear') {
    return { kind };
  }
  if (kind === 'clarify') {
    const message = normalizeStructuredText(typeof parsed.message === 'string' ? parsed.message : '');
    return message ? { kind, message } : null;
  }
  if (kind === 'persona.rewrite') {
    const instruction = normalizeStructuredText(typeof parsed.instruction === 'string' ? parsed.instruction : '');
    return instruction ? { kind, instruction } : null;
  }
  const note = normalizeStructuredText(typeof parsed.note === 'string' ? parsed.note : '');
  return note ? { kind, note } : null;
};

const normalizeResolvedActionKind = (value: unknown): AssistantResolvedAction['kind'] | null => {
  if (typeof value !== 'string') {
    return null;
  }
  switch (value.trim().toLowerCase()) {
    case 'none':
      return 'none';
    case 'clarify':
      return 'clarify';
    case 'set':
    case 'persona.set':
      return 'persona.set';
    case 'append':
    case 'persona.append':
      return 'persona.append';
    case 'clear':
    case 'persona.clear':
      return 'persona.clear';
    case 'rewrite':
    case 'persona.rewrite':
      return 'persona.rewrite';
    default:
      return null;
  }
};

const hasRecentPersonaContext = (priorTurns: AssistantTurn[]) => {
  const recentTurns = priorTurns.slice(-6);
  for (let turnIndex = recentTurns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = recentTurns[turnIndex];
    if (!turn) {
      continue;
    }
    for (let itemIndex = turn.items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = turn.items[itemIndex];
      if (item?.type !== 'userMessage' && item?.type !== 'agentMessage') {
        continue;
      }
      if (personaContextPattern.test(item.text)) {
        return true;
      }
    }
  }
  return false;
};

const normalizeStructuredText = (value: string) =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/^```(?:json|text)?\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
