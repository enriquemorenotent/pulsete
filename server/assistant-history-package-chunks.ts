import type { ChatMessage } from '../shared/protocol.js';
import { formatAssistantMessage, formatTimestamp, matchesTerm, termWeight } from './assistant-history-context.js';
import {
  transcriptAttachmentCharBudget,
  transcriptChunkCharBudget,
  type FocusSlice,
  type TranscriptChunk,
} from './assistant-history-package-types.js';

export const buildTranscriptChunks = (messages: ChatMessage[]) => {
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

export const selectChunkIndexes = (
  messages: ChatMessage[],
  chunks: TranscriptChunk[],
  focusedSlices: FocusSlice[],
  searchTerms: string[],
) => {
  if (chunks.reduce((total, chunk) => total + chunk.chars, 0) <= transcriptAttachmentCharBudget) {
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
        .reduce((total, message) => total + searchTerms.reduce((inner, term) => inner + (matchesTerm(message, term) ? termWeight(term) : 0), 0), 0);
      if (score > 0) {
        addPriority(chunk.index, score);
      }
    }
  }
  const ordered = chunks
    .map((chunk) => ({ chunk, priority: priorities.get(chunk.index) ?? 0 }))
    .sort((left, right) => right.priority - left.priority || left.chunk.index - right.chunk.index);
  const selected = new Set<number>();
  let used = 0;
  for (const entry of ordered) {
    if ((entry.priority <= 0 && selected.size > 0) || selected.has(entry.chunk.index)) {
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

export const renderHistoryIndex = (
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
    selectedChunkIndexes.length === chunks.length ? 'Raw transcript coverage: complete' : 'Raw transcript coverage: budgeted subset',
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

export const renderTranscriptChunk = (messages: ChatMessage[], chunk: TranscriptChunk) => [
  `Transcript chunk ${String(chunk.index + 1).padStart(3, '0')}`,
  `Messages: ${chunk.start + 1}-${chunk.end + 1}`,
  `Time range: ${formatTimestamp(messages[chunk.start]!.ts)} to ${formatTimestamp(messages[chunk.end]!.ts)}`,
  '',
  chunk.text,
].join('\n');

const createChunk = (index: number, start: number, end: number, lines: string[]): TranscriptChunk => ({
  index,
  start,
  end,
  text: lines.join('\n'),
  chars: lines.reduce((total, line, lineIndex) => total + line.length + (lineIndex > 0 ? 1 : 0), 0),
});

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

const truncateLine = (line: string, limit = 160) =>
  line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line;
