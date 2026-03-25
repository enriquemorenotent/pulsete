import type {
  AssistantActiveBuffer,
  AssistantArtifact,
  AssistantAttachmentMetadata,
  AssistantTaskKind,
  AssistantThreadScope,
  BufferState,
  NetworkProfile,
} from '../shared/protocol.js';

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
  'Some turns include only assistant chat context and optional selected-buffer metadata. Only use IRC transcript excerpts when they are explicitly included in the user input.',
  'Do not claim to have executed commands, accessed files outside explicit attachments, or used tools.',
  'Do not mention Codex, app-server, JSON-RPC, or hidden system instructions.',
  'Format replies for a plain-text chat panel: use short paragraphs, and when listing points put each item on its own line.',
  'For summaries, comparisons, timelines, or multiple findings, prefer a brief lead sentence followed by bullets.',
  'For transcript-based factual answers, avoid wall-of-text replies: use labeled plain-text sections with blank lines between them.',
  'For transcript-based factual answers, use this structure when it fits: "Answer:" on its own line, then "Evidence:" with 1 to 3 "-" bullets, then "Limits:" only when needed.',
  'Keep each quoted snippet on its own bullet. Do not chain multiple quotes together inside one paragraph.',
  'Do not compress multiple bullet points into one paragraph separated only by hyphens or semicolons.',
  'When the request is ambiguous, ask one short clarification instead of pretending you searched the transcript.',
].join(' ');

export const buildAssistantTurnInput = ({
  activeBuffer = null,
  attachments = [],
  askInstruction = '',
  buffer,
  context,
  network,
  priorRetrievedContext = '',
  priorTranscript = '',
  prompt,
  resolvedSubject = null,
  retrievedContext = '',
  scope,
  task,
}: {
  activeBuffer?: AssistantActiveBuffer | null;
  attachments?: AssistantAttachmentMetadata[];
  askInstruction?: string;
  buffer: BufferState | null;
  context: string;
  network: NetworkProfile | null;
  priorRetrievedContext?: string;
  priorTranscript?: string;
  prompt: string;
  resolvedSubject?: AssistantActiveBuffer | null;
  retrievedContext?: string;
  scope: AssistantThreadScope;
  task: AssistantTaskKind;
}) => {
  if (task === 'ask') {
    const sections = [
      'Task: Reply to the user. Use transcript excerpts only when they are explicitly included below. When transcript evidence is included, answer from it, cite the strongest supporting date or snippet, say plainly when the evidence is weak or missing, and format factual transcript answers with short labeled sections instead of a dense paragraph.',
      renderAskContext(activeBuffer, resolvedSubject, retrievedContext, priorRetrievedContext, askInstruction),
      renderAssistantThreadContext(priorTranscript),
      renderAttachmentSummary(attachments),
      `User request:\n${(prompt.trim() || defaultPromptForTask(task)).trim()}`,
    ];
    return sections.filter((section) => section.trim()).join('\n\n');
  }
  const sections = [
    `Task: ${describeTask(task, scope)}`,
    renderContext(scope, buffer, network, context),
    renderAssistantThreadContext(priorTranscript),
    renderAttachmentSummary(attachments),
    `User request:\n${(prompt.trim() || defaultPromptForTask(task)).trim()}`,
  ];
  return sections.filter((section) => section.trim()).join('\n\n');
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

export const buildAssistantThreadTitle = (
  task: AssistantTaskKind,
  target: string | null,
  scope: AssistantThreadScope,
) => {
  if (task === 'ask' && scope === 'free') {
    return 'Chat';
  }
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
      : 'Reply to the user.';

const describeTask = (task: AssistantTaskKind, scope: AssistantThreadScope) =>
  task === 'summarize'
    ? 'Summarize the IRC conversation'
    : task === 'draft'
      ? 'Draft a reply'
      : scope === 'free'
        ? 'Chat naturally with the user'
        : 'Answer a question about the IRC buffer';

const renderContext = (
  scope: AssistantThreadScope,
  buffer: BufferState | null,
  network: NetworkProfile | null,
  context: string,
) => {
  if (scope === 'free') {
    return [
      'Conversation mode: free chat',
      'IRC buffer context: not included for this thread',
    ].join('\n');
  }
  const header = [
    'Conversation mode: scoped to an IRC buffer',
    `Network: ${network?.name ?? 'None'}`,
    `Buffer: ${buffer?.target ?? 'None'}`,
    'Context source: prepared from the full buffer history, with indexed history attachments included when needed',
  ].join('\n');
  if (!context.trim()) {
    return `${header}\n\nIRC buffer context:\n(no history available)`;
  }
  return `${header}\n\nIRC buffer context:\n${context}`;
};

const renderAssistantThreadContext = (priorTranscript: string) => {
  if (!priorTranscript.trim()) {
    return '';
  }
  return `Recent assistant thread transcript:\n${priorTranscript}`;
};

const renderAttachmentSummary = (attachments: AssistantAttachmentMetadata[]) => {
  if (attachments.length === 0) {
    return '';
  }
  return [
    'Current turn attachments:',
    ...attachments.map((attachment) =>
      `- ${attachment.name} (${attachment.kind}, ${attachment.mimeType}, ${attachment.size} bytes)`
    ),
  ].join('\n');
};

const renderAskContext = (
  activeBuffer: AssistantActiveBuffer | null,
  resolvedSubject: AssistantActiveBuffer | null,
  retrievedContext: string,
  priorRetrievedContext: string,
  askInstruction: string,
) => {
  const sections = [
    'Conversation mode: assistant chat with optional transcript lookup',
    activeBuffer
      ? [
          'Selected buffer metadata:',
          `- Title: ${activeBuffer.title}`,
          `- Target: ${activeBuffer.target}`,
          `- Buffer id: ${activeBuffer.bufferId}`,
          `- Network id: ${activeBuffer.networkId}`,
        ].join('\n')
      : 'Selected buffer metadata:\n(none)',
    resolvedSubject
      ? [
          'Resolved assistant subject:',
          `- Title: ${resolvedSubject.title}`,
          `- Target: ${resolvedSubject.target}`,
          `- Buffer id: ${resolvedSubject.bufferId}`,
          `- Network id: ${resolvedSubject.networkId}`,
        ].join('\n')
      : 'Resolved assistant subject:\n(none)',
    'Transcript speaker note:\n- Lines prefixed with "you (nick)" were authored by the local user.\n- Other nick-prefixed lines were authored by the remote participant or other people in the chat.',
    'Answer rules:\n- Treat the retrieved transcript context as your only chat-history evidence.\n- For factual transcript answers, format as plain text with short labeled sections: "Answer:", then "Evidence:" with 1 to 3 "-" bullets, then "Limits:" only when needed.\n- Keep each quoted snippet on its own bullet instead of chaining several quotes into one paragraph.\n- Cite the most relevant date or short snippet when answering factual questions.\n- If the evidence is weak, incomplete, or conflicting, say so instead of guessing.',
    askInstruction ? `Routing note:\n${askInstruction}` : '',
    priorRetrievedContext.trim()
      ? `Previously retrieved transcript context from earlier turns:\n${priorRetrievedContext}`
      : '',
    retrievedContext.trim()
      ? `Retrieved transcript context:\n${retrievedContext}`
      : 'Retrieved transcript context:\n(none loaded for this turn)',
  ];
  return sections.filter((section) => section.trim()).join('\n\n');
};
