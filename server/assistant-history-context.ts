import type { AssistantTaskKind, ChatMessage } from '../shared/protocol.js';
import { getTranscriptSpeakerLabel } from '../shared/message-speaker.js';

const fullContextCharBudget = 48_000;
const recentContextCharBudget = 18_000;
const historicalContextCharBudget = 24_000;
const minimumRecentMessages = 20;
const maximumRecentMessages = 120;
const historicalWindowRadius = 4;
const maximumHistoricalWindows = 6;

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'ask',
  'about',
  'been',
  'buffer',
  'but',
  'can',
  'chat',
  'could',
  'conversation',
  'did',
  'does',
  'for',
  'from',
  'have',
  'history',
  'how',
  'into',
  'last',
  'maybe',
  'message',
  'more',
  'much',
  'not',
  'now',
  'our',
  'out',
  'question',
  'recent',
  'should',
  'something',
  'talked',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'those',
  'use',
  'using',
  'want',
  'what',
  'when',
  'where',
  'which',
  'whole',
  'why',
  'with',
  'would',
  'you',
  'your',
]);

type AssistantHistoryContextInput = {
  messages: ChatMessage[];
  prompt: string;
  task: AssistantTaskKind;
};

type SelectedLine = {
  index: number;
  line: string;
};

type HistoryWindow = {
  start: number;
  end: number;
  matchedTerms: string[];
  score: number;
};

export const buildAssistantHistoryContext = ({ messages, prompt, task }: AssistantHistoryContextInput) => {
  if (messages.length === 0) {
    return 'History coverage: empty buffer\n\nTranscript:\n(no messages available)';
  }

  const metadata = [
    'History coverage: full buffer history',
    'Speaker note: lines prefixed with "you (nick)" were sent by the local user.',
    `Total messages: ${messages.length}`,
    `Time range: ${formatTimestamp(messages[0]!.ts)} to ${formatTimestamp(messages.at(-1)!.ts)}`,
  ];
  const fullTranscript = renderFullTranscriptWithinBudget(messages, fullContextCharBudget);
  if (fullTranscript !== null) {
    return `${metadata.join('\n')}\n\nFull transcript:\n${fullTranscript}`;
  }

  const recent = selectRecentTail(messages);
  const olderMessages = messages.slice(0, recent[0]?.index ?? messages.length);
  const searchTerms = extractSearchTerms(prompt);
  const windows = selectHistoricalWindows(olderMessages, searchTerms, task);
  const historicalSection = renderHistoricalWindows(messages, windows);
  const recentSection = recent.map((entry) => entry.line).join('\n');
  const coveredIndexes = new Set<number>(recent.map((entry) => entry.index));
  for (const window of windows) {
    for (let index = window.start; index <= window.end; index += 1) {
      coveredIndexes.add(index);
    }
  }

  const sections = [
    ...metadata,
    'History packing: full history source with a bounded recent tail and selected older windows.',
    searchTerms.length > 0 ? `Prompt search terms: ${searchTerms.join(', ')}` : null,
    '',
    historicalSection,
    '',
    `Recent tail:\n${recentSection}`,
    '',
    `Messages outside the packed context: ${Math.max(0, messages.length - coveredIndexes.size)}`,
  ].filter((value): value is string => Boolean(value));

  return sections.join('\n');
};

const renderHistoricalWindows = (messages: ChatMessage[], windows: HistoryWindow[]) => {
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

const selectRecentTail = (messages: ChatMessage[]) => {
  const selected: SelectedLine[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const line = formatAssistantMessage(messages[index]!);
    const nextCost = used + line.length + 1;
    if (
      selected.length >= minimumRecentMessages
      && (selected.length >= maximumRecentMessages || nextCost > recentContextCharBudget)
    ) {
      break;
    }
    selected.push({ index, line });
    used = nextCost;
  }
  return selected.reverse();
};

const selectHistoricalWindows = (messages: ChatMessage[], searchTerms: string[], task: AssistantTaskKind) => {
  if (messages.length === 0) {
    return [];
  }
  const ranked = searchTerms.length > 0
    ? scoreMessageMatches(messages, searchTerms)
    : [];
  const selected = ranked.length > 0
    ? pickRankedWindows(messages.length, ranked)
    : sampleWindows(messages.length, task);
  return selected.sort((left, right) => left.start - right.start);
};

const scoreMessageMatches = (messages: ChatMessage[], searchTerms: string[]) =>
  messages
    .map((message, index) => {
      const matchedTerms = searchTerms.filter((term) => matchesTerm(message, term));
      return {
        index,
        matchedTerms,
        score: matchedTerms.reduce((total, term) => total + termWeight(term), 0),
      };
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
    if (windows.some((window) => overlaps(window, candidate))) {
      continue;
    }
    windows.push(candidate);
  }
  return windows;
};

const estimateWindowChars = (window: HistoryWindow) =>
  Math.max(1, window.end - window.start + 1) * 120;

const overlaps = (left: Pick<HistoryWindow, 'start' | 'end'>, right: Pick<HistoryWindow, 'start' | 'end'>) =>
  left.start <= right.end && right.start <= left.end;

export const extractSearchTerms = (prompt: string) => {
  const terms = prompt.toLowerCase().match(/[a-z0-9#@._-]+/g) ?? [];
  const unique = new Set<string>();
  for (const term of terms) {
    if (unique.size >= 8) {
      break;
    }
    if (!isSearchTerm(term) || unique.has(term)) {
      continue;
    }
    unique.add(term);
  }
  return [...unique];
};

const isSearchTerm = (term: string) =>
  !stopWords.has(term)
  && (term.length >= 3 || /[#@]/.test(term) || /\d/.test(term));

export const matchesTerm = (message: ChatMessage, term: string) => {
  const haystacks = [
    message.nick?.toLowerCase() ?? '',
    message.body.toLowerCase(),
    message.kind.toLowerCase(),
    buildTimestampSearchText(message.ts),
  ];
  return haystacks.some((haystack) => haystack.includes(term));
};

export const termWeight = (term: string) => {
  if (/[#@]/.test(term) || /\d/.test(term)) {
    return 6;
  }
  if (term.length >= 7) {
    return 5;
  }
  if (term.length >= 5) {
    return 4;
  }
  return 3;
};

export const renderMessages = (messages: ChatMessage[]) =>
  messages.map(formatMessage).join('\n');

export const renderAssistantMessages = (messages: ChatMessage[]) =>
  messages.map(formatAssistantMessage).join('\n');

const renderFullTranscriptWithinBudget = (messages: ChatMessage[], budget: number) => {
  const lines: string[] = [];
  let used = 0;
  for (const message of messages) {
    const line = formatAssistantMessage(message);
    used += line.length + (lines.length > 0 ? 1 : 0);
    if (used > budget) {
      return null;
    }
    lines.push(line);
  }
  return lines.join('\n');
};

export const formatMessage = (message: ChatMessage) => {
  const time = formatTimestamp(message.ts);
  if (message.kind === 'join' || message.kind === 'part' || message.kind === 'quit' || message.kind === 'system') {
    return `[${time}] (${message.kind}) ${message.body}`;
  }
  const author = formatTranscriptAuthor(message, false);
  if (message.kind === 'action') {
    return `[${time}] * ${author} ${message.body}`;
  }
  return `[${time}] ${author}: ${message.body}`;
};

export const formatAssistantMessage = (message: ChatMessage) => {
  const time = formatTimestamp(message.ts);
  if (message.kind === 'join' || message.kind === 'part' || message.kind === 'quit' || message.kind === 'system') {
    return `[${time}] (${message.kind}) ${message.body}`;
  }
  const author = formatTranscriptAuthor(message, true);
  if (message.kind === 'action') {
    return `[${time}] * ${author} ${message.body}`;
  }
  return `[${time}] ${author}: ${message.body}`;
};

export const formatTimestamp = (ts: number) =>
  new Date(ts).toISOString().replace('T', ' ').slice(0, 16);

const buildTimestampSearchText = (ts: number) => {
  const date = new Date(ts);
  const year = String(date.getUTCFullYear());
  const monthIndex = date.getUTCMonth();
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthShort = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toLowerCase();
  const monthLong = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  const day = String(date.getUTCDate()).padStart(2, '0');
  return [
    formatTimestamp(ts).toLowerCase(),
    `${year}-${monthNumber}-${day}`,
    year,
    monthShort,
    monthLong,
    `${monthShort} ${year}`,
    `${monthLong} ${year}`,
  ].join(' ');
};

const formatTranscriptAuthor = (message: ChatMessage, annotateSelf: boolean) => {
  const speaker = getTranscriptSpeakerLabel(message);
  if (speaker === 'you') {
    if (annotateSelf && message.nick) {
      return `you (${message.nick})`;
    }
    return message.nick ?? 'you';
  }
  return speaker;
};
