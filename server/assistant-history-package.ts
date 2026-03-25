import type { AssistantTaskKind, AssistantTurnAttachmentInput, ChatMessage } from '../shared/protocol.js';
import {
  buildAssistantHistoryContext,
  extractSearchTerms,
  formatAssistantMessage,
  formatTimestamp,
  matchesTerm,
  renderAssistantMessages,
  termWeight,
} from './assistant-history-context.js';

const transcriptChunkCharBudget = 18_000;
const transcriptAttachmentCharBudget = 180_000;
const defaultFocusedEdgeCount = 12;
const defaultExplicitEdgeCount = 24;
const maximumExplicitEdgeCount = 200;
const focusedWindowRadius = 4;
const maximumFocusedWindows = 12;
const focusedAttachmentCharBudget = 48_000;

type AssistantHistoryPackageInput = {
  messages: ChatMessage[];
  prompt: string;
  task: AssistantTaskKind;
};

type AssistantHistoryPackage = {
  attachments: AssistantTurnAttachmentInput[];
  context: string;
};

type FocusSlice = {
  start: number;
  end: number;
  label: string;
  priority: number;
};

type TranscriptChunk = {
  index: number;
  start: number;
  end: number;
  text: string;
  chars: number;
};

export const buildAssistantHistoryPackage = ({
  messages,
  prompt,
  task,
}: AssistantHistoryPackageInput): AssistantHistoryPackage => {
  const context = buildAssistantHistoryContext({ messages, prompt, task });
  if (messages.length === 0 || context.includes('\n\nFull transcript:\n')) {
    return { attachments: [], context };
  }

  const searchTerms = extractSearchTerms(prompt);
  const chunks = buildTranscriptChunks(messages);
  const focusedSlices = buildFocusedSlices(messages, prompt, searchTerms);
  const focusedAttachment = buildFocusedAttachment(messages, prompt, searchTerms, focusedSlices);
  const selectedChunkIndexes = selectChunkIndexes(messages, chunks, focusedSlices, searchTerms);
  const transcriptAttachments = selectedChunkIndexes.map((chunkIndex) =>
    toTextAttachment(
      `history-transcript-${String(chunkIndex + 1).padStart(3, '0')}.txt`,
      renderTranscriptChunk(messages, chunks[chunkIndex]!),
    )
  );
  const attachments = [
    focusedAttachment,
    toTextAttachment(
      'history-index.txt',
      renderHistoryIndex(messages, chunks, selectedChunkIndexes),
    ),
    ...transcriptAttachments,
  ].filter((attachment): attachment is AssistantTurnAttachmentInput => attachment !== null);

  return {
    attachments,
    context: [
      context,
      '',
      'Additional history package:',
      '- The overview above is a guide built from the full buffer history.',
      attachments.some((attachment) => attachment.name === 'history-query-focus.txt')
        ? '- `history-query-focus.txt` contains exact excerpts pulled directly from the full stored transcript for this request.'
        : null,
      '- `history-index.txt` maps the entire transcript in chronological chunks.',
      selectedChunkIndexes.length === chunks.length
        ? '- The attached `history-transcript-*.txt` files contain the full raw transcript.'
        : '- The attached `history-transcript-*.txt` files are a budgeted raw-transcript subset chosen from the full history. Use the index and query-focus excerpts to reason about any gaps.',
    ].filter((line): line is string => Boolean(line)).join('\n'),
  };
};

const buildTranscriptChunks = (messages: ChatMessage[]) => {
  const chunks: TranscriptChunk[] = [];
  let start = 0;
  let lines: string[] = [];
  let used = 0;
  for (let index = 0; index < messages.length; index += 1) {
    const line = formatAssistantMessage(messages[index]!);
    const nextCost = used + line.length + (lines.length > 0 ? 1 : 0);
    if (lines.length > 0 && nextCost > transcriptChunkCharBudget) {
      chunks.push(createChunk(chunks.length, start, index - 1, lines));
      start = index;
      lines = [line];
      used = line.length;
      continue;
    }
    lines.push(line);
    used = nextCost;
  }
  if (lines.length > 0) {
    chunks.push(createChunk(chunks.length, start, messages.length - 1, lines));
  }
  return chunks;
};

const createChunk = (index: number, start: number, end: number, lines: string[]): TranscriptChunk => ({
  index,
  start,
  end,
  text: lines.join('\n'),
  chars: lines.reduce((total, line, lineIndex) => total + line.length + (lineIndex > 0 ? 1 : 0), 0),
});

const buildFocusedSlices = (messages: ChatMessage[], prompt: string, searchTerms: string[]) => {
  const rawSlices: FocusSlice[] = [
    {
      start: 0,
      end: Math.min(messages.length - 1, defaultFocusedEdgeCount - 1),
      label: 'Opening messages',
      priority: 90,
    },
    {
      start: Math.max(0, messages.length - defaultFocusedEdgeCount),
      end: messages.length - 1,
      label: 'Closing messages',
      priority: 80,
    },
  ];

  const firstCount = parseEdgeMessageCount(prompt, 'first');
  if (firstCount !== null) {
    rawSlices.push({
      start: 0,
      end: Math.min(messages.length - 1, firstCount - 1),
      label: `First ${firstCount} messages`,
      priority: 120,
    });
  } else if (mentionsOpening(prompt)) {
    rawSlices.push({
      start: 0,
      end: Math.min(messages.length - 1, defaultExplicitEdgeCount - 1),
      label: 'Opening conversation',
      priority: 110,
    });
  }

  const lastCount = parseEdgeMessageCount(prompt, 'last');
  if (lastCount !== null) {
    rawSlices.push({
      start: Math.max(0, messages.length - lastCount),
      end: messages.length - 1,
      label: `Last ${lastCount} messages`,
      priority: 115,
    });
  } else if (mentionsClosing(prompt)) {
    rawSlices.push({
      start: Math.max(0, messages.length - defaultExplicitEdgeCount),
      end: messages.length - 1,
      label: 'Closing conversation',
      priority: 105,
    });
  }

  rawSlices.push(...buildSearchSlices(messages, searchTerms));
  return normalizeSlices(messages.length, rawSlices).slice(0, maximumFocusedWindows);
};

const parseEdgeMessageCount = (prompt: string, direction: 'first' | 'last') => {
  const pattern = direction === 'first'
    ? /\b(?:first|opening|initial|earliest)\s+(\d{1,4})\s+messages?\b/i
    : /\b(?:last|latest|recent|final)\s+(\d{1,4})\s+messages?\b/i;
  const count = Number.parseInt(prompt.match(pattern)?.[1] ?? '', 10);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  return Math.min(count, maximumExplicitEdgeCount);
};

const mentionsOpening = (prompt: string) =>
  /\b(?:opening conversation|beginning of (?:the |our )?(?:chat|conversation|history)|start of (?:the |our )?(?:chat|conversation|history)|earliest messages?|first messages?)\b/i
    .test(prompt);

const mentionsClosing = (prompt: string) =>
  /\b(?:closing conversation|end of (?:the |our )?(?:chat|conversation|history)|latest messages?|recent messages?|final messages?)\b/i
    .test(prompt);

const buildSearchSlices = (messages: ChatMessage[], searchTerms: string[]) => {
  if (searchTerms.length === 0) {
    return [];
  }
  const slices: FocusSlice[] = [];
  for (const term of searchTerms) {
    const hits = messages.reduce<number[]>((indexes, message, index) => {
      if (matchesTerm(message, term)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (hits.length === 0) {
      continue;
    }
    slices.push(windowForIndex(hits[0]!, `First hit for "${term}"`, termPriority(term, 70)));
    if (hits.at(-1) !== hits[0]) {
      slices.push(windowForIndex(hits.at(-1)!, `Latest hit for "${term}"`, termPriority(term, 65)));
    }
  }

  const rankedMessages = messages
    .map((message, index) => ({
      index,
      score: searchTerms.reduce((total, term) => total + (matchesTerm(message, term) ? termWeight(term) : 0), 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 4);
  for (const entry of rankedMessages) {
    slices.push(windowForIndex(entry.index, 'Strong prompt match', 95 + entry.score));
  }
  return slices;
};

const windowForIndex = (index: number, label: string, priority: number): FocusSlice => ({
  start: Math.max(0, index - focusedWindowRadius),
  end: index + focusedWindowRadius,
  label,
  priority,
});

const termPriority = (term: string, base: number) =>
  base + Math.min(20, termWeight(term) * 2);

const normalizeSlices = (totalMessages: number, slices: FocusSlice[]) => {
  const sorted = slices
    .filter((slice) => slice.start < totalMessages)
    .map((slice) => ({
      ...slice,
      start: Math.max(0, slice.start),
      end: Math.min(totalMessages - 1, slice.end),
    }))
    .sort((left, right) => left.start - right.start || right.priority - left.priority);
  const merged: FocusSlice[] = [];
  for (const slice of sorted) {
    const previous = merged.at(-1);
    if (!previous || previous.end + 1 < slice.start) {
      merged.push(slice);
      continue;
    }
    previous.end = Math.max(previous.end, slice.end);
    previous.priority = Math.max(previous.priority, slice.priority);
    previous.label = previous.label === slice.label ? previous.label : `${previous.label}; ${slice.label}`;
  }
  return merged.sort((left, right) => right.priority - left.priority || left.start - right.start);
};

const buildFocusedAttachment = (
  messages: ChatMessage[],
  prompt: string,
  searchTerms: string[],
  focusedSlices: FocusSlice[],
) => {
  const header = [
    'Exact history excerpts',
    `Prompt: ${prompt.trim() || '(empty request)'}`,
    searchTerms.length > 0 ? `Prompt search terms: ${searchTerms.join(', ')}` : 'Prompt search terms: (none)',
    'These excerpts are copied directly from the full stored transcript.',
  ].join('\n');
  const blocks: string[] = [];
  let used = header.length + 2;
  for (const [index, slice] of focusedSlices.entries()) {
    const block = [
      `Slice ${index + 1} | ${slice.label} | messages ${slice.start + 1}-${slice.end + 1} | ${formatTimestamp(messages[slice.start]!.ts)} to ${formatTimestamp(messages[slice.end]!.ts)}`,
      renderAssistantMessages(messages.slice(slice.start, slice.end + 1)),
    ].join('\n');
    if (blocks.length > 0 && used + block.length + 2 > focusedAttachmentCharBudget) {
      break;
    }
    blocks.push(block);
    used += block.length + 2;
  }
  if (blocks.length === 0) {
    return null;
  }
  return toTextAttachment('history-query-focus.txt', `${header}\n\n${blocks.join('\n\n')}`);
};

const selectChunkIndexes = (
  messages: ChatMessage[],
  chunks: TranscriptChunk[],
  focusedSlices: FocusSlice[],
  searchTerms: string[],
) => {
  const totalChars = chunks.reduce((total, chunk) => total + chunk.chars, 0);
  if (totalChars <= transcriptAttachmentCharBudget) {
    return chunks.map((chunk) => chunk.index);
  }

  const priorities = new Map<number, number>();
  const addPriority = (chunkIndex: number, amount: number) => {
    priorities.set(chunkIndex, (priorities.get(chunkIndex) ?? 0) + amount);
  };

  if (chunks.length > 0) {
    addPriority(0, 500);
    addPriority(chunks.length - 1, 480);
  }

  for (const slice of focusedSlices) {
    for (const chunk of chunks) {
      if (chunk.start <= slice.end && slice.start <= chunk.end) {
        addPriority(chunk.index, 300 + slice.priority);
      }
    }
  }

  if (searchTerms.length > 0) {
    for (const chunk of chunks) {
      const score = messages
        .slice(chunk.start, chunk.end + 1)
        .reduce((total, message) =>
          total + searchTerms.reduce((inner, term) => inner + (matchesTerm(message, term) ? termWeight(term) : 0), 0), 0);
      if (score > 0) {
        addPriority(chunk.index, score);
      }
    }
  }

  const ordered = chunks
    .map((chunk) => ({
      chunk,
      priority: priorities.get(chunk.index) ?? 0,
    }))
    .sort((left, right) => right.priority - left.priority || left.chunk.index - right.chunk.index);
  const selected = new Set<number>();
  let used = 0;
  for (const entry of ordered) {
    if (entry.priority <= 0 && selected.size > 0) {
      continue;
    }
    if (selected.has(entry.chunk.index)) {
      continue;
    }
    if (used > 0 && used + entry.chunk.chars > transcriptAttachmentCharBudget) {
      continue;
    }
    selected.add(entry.chunk.index);
    used += entry.chunk.chars;
  }

  for (const chunkIndex of sampleRemainingChunks(chunks.length, selected)) {
    const chunk = chunks[chunkIndex]!;
    if (used + chunk.chars > transcriptAttachmentCharBudget) {
      continue;
    }
    selected.add(chunkIndex);
    used += chunk.chars;
  }

  if (selected.size === 0 && chunks.length > 0) {
    selected.add(0);
  }

  return [...selected].sort((left, right) => left - right);
};

const sampleRemainingChunks = (totalChunks: number, selected: Set<number>) => {
  const desired = Math.min(6, totalChunks);
  const result: number[] = [];
  for (let position = 1; position <= desired; position += 1) {
    const index = Math.min(totalChunks - 1, Math.floor((totalChunks * position) / (desired + 1)));
    if (!selected.has(index) && !result.includes(index)) {
      result.push(index);
    }
  }
  return result;
};

const renderHistoryIndex = (
  messages: ChatMessage[],
  chunks: TranscriptChunk[],
  selectedChunkIndexes: number[],
) => {
  const selected = new Set(selectedChunkIndexes);
  const lines = [
    'Full transcript index',
    `Total messages: ${messages.length}`,
    `Total transcript chunks: ${chunks.length}`,
    `Attached transcript chunks this turn: ${selectedChunkIndexes.length}`,
    selectedChunkIndexes.length === chunks.length
      ? 'Raw transcript coverage: complete'
      : 'Raw transcript coverage: budgeted subset',
    '',
  ];
  for (const chunk of chunks) {
    lines.push([
      `${selected.has(chunk.index) ? '[attached]' : '[indexed only]'}`,
      `Chunk ${String(chunk.index + 1).padStart(3, '0')}`,
      `messages ${chunk.start + 1}-${chunk.end + 1}`,
      `${formatTimestamp(messages[chunk.start]!.ts)} to ${formatTimestamp(messages[chunk.end]!.ts)}`,
    ].join(' | '));
    const chunkLines = chunk.text.split('\n');
    lines.push(`first: ${truncateLine(chunkLines[0] ?? '')}`);
    lines.push(`last: ${truncateLine(chunkLines.at(-1) ?? '')}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
};

const renderTranscriptChunk = (messages: ChatMessage[], chunk: TranscriptChunk) => [
  `Transcript chunk ${String(chunk.index + 1).padStart(3, '0')}`,
  `Messages: ${chunk.start + 1}-${chunk.end + 1}`,
  `Time range: ${formatTimestamp(messages[chunk.start]!.ts)} to ${formatTimestamp(messages[chunk.end]!.ts)}`,
  '',
  chunk.text,
].join('\n');

const truncateLine = (line: string, limit = 160) =>
  line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;

const toTextAttachment = (name: string, text: string): AssistantTurnAttachmentInput => ({
  id: `history:${name}`,
  kind: 'text',
  name,
  mimeType: 'text/plain',
  size: Buffer.byteLength(text, 'utf8'),
  text,
});
