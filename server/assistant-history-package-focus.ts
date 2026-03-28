import type { ChatMessage } from '../shared/protocol.js';
import { formatTimestamp, matchesTerm, renderAssistantMessages, termWeight } from './assistant-history-context.js';
import {
  defaultExplicitEdgeCount,
  defaultFocusedEdgeCount,
  focusedAttachmentCharBudget,
  focusedWindowRadius,
  maximumExplicitEdgeCount,
  maximumFocusedWindows,
  type FocusSlice,
} from './assistant-history-package-types.js';

export const buildFocusedSlices = (messages: ChatMessage[], prompt: string, searchTerms: string[]) => {
  const rawSlices: FocusSlice[] = [
    { start: 0, end: Math.min(messages.length - 1, defaultFocusedEdgeCount - 1), label: 'Opening messages', priority: 90 },
    { start: Math.max(0, messages.length - defaultFocusedEdgeCount), end: messages.length - 1, label: 'Closing messages', priority: 80 },
  ];
  const firstCount = parseEdgeMessageCount(prompt, 'first');
  if (firstCount !== null) {
    rawSlices.push({ start: 0, end: Math.min(messages.length - 1, firstCount - 1), label: `First ${firstCount} messages`, priority: 120 });
  } else if (mentionsOpening(prompt)) {
    rawSlices.push({ start: 0, end: Math.min(messages.length - 1, defaultExplicitEdgeCount - 1), label: 'Opening conversation', priority: 110 });
  }
  const lastCount = parseEdgeMessageCount(prompt, 'last');
  if (lastCount !== null) {
    rawSlices.push({ start: Math.max(0, messages.length - lastCount), end: messages.length - 1, label: `Last ${lastCount} messages`, priority: 115 });
  } else if (mentionsClosing(prompt)) {
    rawSlices.push({ start: Math.max(0, messages.length - defaultExplicitEdgeCount), end: messages.length - 1, label: 'Closing conversation', priority: 105 });
  }
  rawSlices.push(...buildSearchSlices(messages, searchTerms));
  return normalizeSlices(messages.length, rawSlices).slice(0, maximumFocusedWindows);
};

export const buildFocusedAttachmentText = (
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
  return blocks.length > 0 ? `${header}\n\n${blocks.join('\n\n')}` : null;
};

const parseEdgeMessageCount = (prompt: string, direction: 'first' | 'last') => {
  const pattern = direction === 'first'
    ? /\b(?:first|opening|initial|earliest)\s+(\d{1,4})\s+messages?\b/i
    : /\b(?:last|latest|recent|final)\s+(\d{1,4})\s+messages?\b/i;
  const count = Number.parseInt(prompt.match(pattern)?.[1] ?? '', 10);
  return Number.isFinite(count) && count > 0 ? Math.min(count, maximumExplicitEdgeCount) : null;
};

const mentionsOpening = (prompt: string) =>
  /\b(?:opening conversation|beginning of (?:the |our )?(?:chat|conversation|history)|start of (?:the |our )?(?:chat|conversation|history)|earliest messages?|first messages?)\b/i.test(prompt);

const mentionsClosing = (prompt: string) =>
  /\b(?:closing conversation|end of (?:the |our )?(?:chat|conversation|history)|latest messages?|recent messages?|final messages?)\b/i.test(prompt);

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

const termPriority = (term: string, base: number) => base + Math.min(20, termWeight(term) * 2);

const normalizeSlices = (totalMessages: number, slices: FocusSlice[]) => {
  const sorted = slices
    .filter((slice) => slice.start < totalMessages)
    .map((slice) => ({ ...slice, start: Math.max(0, slice.start), end: Math.min(totalMessages - 1, slice.end) }))
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
