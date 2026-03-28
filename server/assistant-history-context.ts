import type { AssistantTaskKind, ChatMessage } from '../shared/protocol.js';
import {
  formatAssistantMessage,
  formatMessage,
  formatTimestamp,
  renderAssistantMessages,
  renderFullTranscriptWithinBudget,
  renderMessages,
} from './assistant-history-format.js';
import { extractProfileFactTerms, extractSearchTerms, matchesTerm, termWeight } from './assistant-history-search.js';
import { renderHistoricalWindows, selectHistoricalWindows, selectRecentTail } from './assistant-history-windows.js';

const fullContextCharBudget = 48_000;

type AssistantHistoryContextInput = {
  messages: ChatMessage[];
  prompt: string;
  task: AssistantTaskKind;
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

export {
  extractProfileFactTerms,
  extractSearchTerms,
  formatAssistantMessage,
  formatMessage,
  formatTimestamp,
  matchesTerm,
  renderAssistantMessages,
  renderMessages,
  termWeight,
};
