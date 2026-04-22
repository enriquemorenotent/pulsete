export type ExplicitAssistantPersonaNoteCommand =
  | { kind: 'set'; note: string }
  | { kind: 'append'; note: string }
  | { kind: 'clear' }
  | { kind: 'clarify' };

export const assistantPersonaRewriteOutputSchema = {
  type: 'object',
  properties: {
    note: { type: 'string' },
  },
  required: ['note'],
  additionalProperties: false,
} as const;

export const parseExplicitPersonaNoteCommand = (
  prompt: string,
): ExplicitAssistantPersonaNoteCommand | null => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\/persona\s+clear\b(?:[\s\S]*)$/i.test(trimmed)) {
    return { kind: 'clear' };
  }

  const appendNote = extractPersonaNote(trimmed, [
    /^\/persona\s+append\s+([\s\S]+)$/i,
  ]);
  if (appendNote) {
    return { kind: 'append', note: appendNote };
  }

  const setNote = extractPersonaNote(trimmed, [
    /^\/persona\s+(?:set|replace)\s+([\s\S]+)$/i,
  ]);
  if (setNote) {
    return { kind: 'set', note: setNote };
  }

  if (/^\/persona\b/i.test(trimmed)) {
    return { kind: 'clarify' };
  }

  return null;
};

export const applyPersonaNoteCommand = (
  currentNote: string,
  command: Extract<ExplicitAssistantPersonaNoteCommand, { kind: 'set' | 'append' | 'clear' }>,
) => {
  if (command.kind === 'clear') {
    return '';
  }
  if (command.kind === 'set') {
    return normalizePersonaNote(command.note);
  }
  const current = normalizePersonaNote(currentNote).trim();
  const appended = normalizePersonaNote(command.note).trim();
  if (!current) {
    return appended;
  }
  if (!appended) {
    return current;
  }
  return `${current}\n${appended}`;
};

export const buildPersonaNoteClarification = () =>
  'Tell me exactly what to change. Example: "Add this to my persona note: confident and playful" to append, or "/persona set 44 yo Spanish woman\\nMarried\\nLiving in Germany" to replace the whole note.';

export const buildPersonaNoteMissingNetworkReply = () =>
  'Select a buffer on the network first, then ask me to update the persona note for that network.';

export const buildPersonaNoteNoChangeReply = (
  networkName: string,
) => `That persona note is already saved for ${networkName}.`;

export const buildPersonaNoteUpdatedReply = ({
  kind,
  networkName,
  note,
}: {
  kind: 'set' | 'append' | 'clear' | 'rewrite';
  networkName: string;
  note: string;
}) => {
  if (kind === 'clear') {
    return `Cleared your persona note for ${networkName}.`;
  }
  const lead = kind === 'append'
    ? `Added that to your persona note for ${networkName}.`
    : `Updated your persona note for ${networkName}.`;
  return note
    ? `${lead}\n\nCurrent note:\n${note}`
    : lead;
};

export const buildPersonaNoteRewriteInput = ({
  currentNote,
  instruction,
  networkName,
}: {
  currentNote: string;
  instruction: string;
  networkName: string;
}) => [
  'Task: Rewrite the saved persona note for this network.',
  `Network: ${networkName}`,
  'Rules:',
  '- Preserve every factual detail from the current note unless the user explicitly asked to change or remove it.',
  '- Improve readability and organization.',
  '- Output only the rewritten persona note content.',
  '- Do not add commentary, labels, bullets, markdown, or code fences.',
  '- Keep each fact on its own line when that improves clarity.',
  `Current persona note:\n${currentNote || '(empty persona note)'}`,
  `User request:\n${instruction}`,
].join('\n\n');

const extractPersonaNote = (
  prompt: string,
  patterns: RegExp[],
) => {
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const candidate = match?.[1];
    if (!candidate) {
      continue;
    }
    const note = normalizePersonaNote(stripWrappingQuotes(candidate).trim());
    if (note) {
      return note;
    }
  }
  return null;
};

const stripWrappingQuotes = (value: string) => {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
    return value.slice(1, -1);
  }
  return value;
};

const normalizePersonaNote = (value: string) => value.replace(/\r\n?/g, '\n').trim();
