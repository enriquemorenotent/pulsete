import type { AssistantArtifact, AssistantTaskKind, BufferState, NetworkProfile } from '../shared/protocol.js';

const summaryOutputSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'highlights'],
  additionalProperties: false,
} as const;

const draftOutputSchema = {
  type: 'object',
  properties: {
    draft: { type: 'string' },
  },
  required: ['draft'],
  additionalProperties: false,
} as const;

export const assistantBaseInstructions = [
  'You are Pulsete, an IRC conversation assistant.',
  'Only use the IRC context included in the user input for your answer.',
  'Do not claim to have executed commands, accessed files, or used tools.',
  'Do not mention Codex, app-server, JSON-RPC, or hidden system instructions.',
].join(' ');

export const buildAssistantTurnInput = ({
  buffer,
  context,
  network,
  prompt,
  task,
}: {
  buffer: BufferState | null;
  context: string;
  network: NetworkProfile | null;
  prompt: string;
  task: AssistantTaskKind;
}) => {
  const sections = [
    `Task: ${describeTask(task)}`,
    renderContext(buffer, network, context),
    `User request:\n${(prompt.trim() || defaultPromptForTask(task)).trim()}`,
  ];
  return sections.join('\n\n');
};

export const extractAssistantUserPrompt = (text: string) => {
  const marker = '\n\nUser request:\n';
  const index = text.indexOf(marker);
  if (index === -1) {
    return text.trim();
  }
  const prompt = text.slice(index + marker.length).trim();
  return prompt || text.trim();
};

export const getAssistantOutputSchema = (task: AssistantTaskKind) =>
  task === 'summarize'
    ? summaryOutputSchema
    : task === 'draft'
      ? draftOutputSchema
      : undefined;

export const buildAssistantThreadTitle = (task: AssistantTaskKind, target: string | null) => {
  const prefix = task === 'ask' ? 'Ask' : task === 'summarize' ? 'Summary' : 'Draft';
  return target ? `${prefix} · ${target}` : prefix;
};

export const parseAssistantArtifact = (task: AssistantTaskKind, text: string): AssistantArtifact | null => {
  if (task === 'ask') {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (task === 'summarize' && typeof parsed.summary === 'string' && Array.isArray(parsed.highlights)) {
      const highlights = parsed.highlights.filter((value): value is string => typeof value === 'string');
      return { type: 'summary', summary: parsed.summary, highlights };
    }
    if (task === 'draft' && typeof parsed.draft === 'string') {
      return { type: 'draft', draft: parsed.draft };
    }
  } catch {
    return null;
  }
  return null;
};

const defaultPromptForTask = (task: AssistantTaskKind) =>
  task === 'summarize'
    ? 'Summarize the IRC discussion and call out the most important follow-up points.'
    : task === 'draft'
      ? 'Draft a reply that fits the IRC conversation.'
      : 'Answer the question using the IRC buffer context above.';

const describeTask = (task: AssistantTaskKind) =>
  task === 'summarize' ? 'Summarize the IRC conversation' : task === 'draft' ? 'Draft a reply' : 'Answer a question';

const renderContext = (buffer: BufferState | null, network: NetworkProfile | null, context: string) => {
  const header = [
    `Network: ${network?.name ?? 'None'}`,
    `Buffer: ${buffer?.target ?? 'None'}`,
    'Context source: prepared from the full buffer history and condensed when needed',
  ].join('\n');
  if (!context.trim()) {
    return `${header}\n\nIRC buffer context:\n(no history available)`;
  }
  return `${header}\n\nIRC buffer context:\n${context}`;
};
