import type { AssistantTaskKind, ChatMessage } from '../shared/protocol.js';
import { formatAssistantMessage, formatTimestamp, renderAssistantMessages } from './assistant-history-format.js';
import { matchesTerm, termWeight } from './assistant-history-search.js';

const recentContextCharBudget = 18_000;
const historicalContextCharBudget = 24_000;
const minimumRecentMessages = 20;
const maximumRecentMessages = 120;
const historicalWindowRadius = 4;
const maximumHistoricalWindows = 6;

type SelectedLine = {
  index: number;
  line: string;
};

export type HistoryWindow = {
  start: number;
  end: number;
  matchedTerms: string[];
  score: number;
};

export const renderHistoricalWindows = (messages: ChatMessage[], windows: HistoryWindow[]) => {
  if (windows.length === 0) {
    return 'Historical windows:\n(none selected from older history)';
  }
  const blocks = windows.map((window, index) => {
    const header = [
      `Window ${index + 1}`,
      `${formatTimestamp(messages[window.start]!.ts)} to ${formatTimestamp(messages[window.end]!.ts)}`,
      window.matchedTerms.length > 0 ? `matched: ${window.matchedTerms.join(', ')}` : 'sampled older context',
    ].join(' | ');
    return `${header}\n${renderAssistantMessages(messages.slice(window.start, window.end + 1))}`;
  });
  return `Historical windows:\n${blocks.join('\n\n')}`;
};

export const selectRecentTail = (messages: ChatMessage[]) => {
  const selected: SelectedLine[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const line = formatAssistantMessage(messages[index]!);
    const nextCost = used + line.length + 1;
    if (selected.length >= minimumRecentMessages && (selected.length >= maximumRecentMessages || nextCost > recentContextCharBudget)) {
      break;
    }
    selected.push({ index, line });
    used = nextCost;
  }
  return selected.reverse();
};

export const selectHistoricalWindows = (messages: ChatMessage[], searchTerms: string[], task: AssistantTaskKind) => {
  if (messages.length === 0) {
    return [];
  }
  const ranked = searchTerms.length > 0 ? scoreMessageMatches(messages, searchTerms) : [];
  const selected = ranked.length > 0 ? pickRankedWindows(messages.length, ranked) : sampleWindows(messages.length, task);
  return selected.sort((left, right) => left.start - right.start);
};

const scoreMessageMatches = (messages: ChatMessage[], searchTerms: string[]) =>
  messages
    .map((message, index) => {
      const matchedTerms = searchTerms.filter((term) => matchesTerm(message, term));
      return { index, matchedTerms, score: matchedTerms.reduce((total, term) => total + termWeight(term), 0) };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.index - left.index);

const pickRankedWindows = (
  totalMessages: number,
  ranked: Array<{ index: number; matchedTerms: string[]; score: number }>,
) => {
  const windows: HistoryWindow[] = [];
  let usedChars = 0;
  for (const entry of ranked) {
    const candidate = {
      start: Math.max(0, entry.index - historicalWindowRadius),
      end: Math.min(totalMessages - 1, entry.index + historicalWindowRadius),
      matchedTerms: entry.matchedTerms,
      score: entry.score,
    } satisfies HistoryWindow;
    if (windows.some((window) => overlaps(window, candidate))) {
      continue;
    }
    const estimatedChars = estimateWindowChars(candidate);
    if (windows.length > 0 && usedChars + estimatedChars > historicalContextCharBudget) {
      break;
    }
    windows.push(candidate);
    usedChars += estimatedChars;
    if (windows.length >= maximumHistoricalWindows) {
      break;
    }
  }
  return windows;
};

const sampleWindows = (totalMessages: number, task: AssistantTaskKind) => {
  const desiredWindows = task === 'summarize' ? maximumHistoricalWindows : Math.min(4, maximumHistoricalWindows);
  const windows: HistoryWindow[] = [];
  for (let position = 1; position <= desiredWindows; position += 1) {
    const center = Math.floor((totalMessages * position) / (desiredWindows + 1));
    const candidate = {
      start: Math.max(0, center - historicalWindowRadius),
      end: Math.min(totalMessages - 1, center + historicalWindowRadius),
      matchedTerms: [],
      score: 0,
    } satisfies HistoryWindow;
    if (!windows.some((window) => overlaps(window, candidate))) {
      windows.push(candidate);
    }
  }
  return windows;
};

const estimateWindowChars = (window: HistoryWindow) =>
  Math.max(1, window.end - window.start + 1) * 120;

const overlaps = (left: Pick<HistoryWindow, 'start' | 'end'>, right: Pick<HistoryWindow, 'start' | 'end'>) =>
  left.start <= right.end && right.start <= left.end;
