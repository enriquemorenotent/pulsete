import type { BufferState, ChatMessage } from './protocol-chat.js';

export type BufferHistorySearchResult = {
  message: ChatMessage;
  context: ChatMessage[];
};

export type BufferHistorySearchPayload = {
  query: string;
  results: BufferHistorySearchResult[];
  hasMore: boolean;
};

export type LogHistorySearchFilters = {
  networkId?: string | null;
  target?: string | null;
};

export type LogHistorySearchPayload = LogHistorySearchFilters & {
  query: string;
  results: BufferHistorySearchResult[];
  hasMore: boolean;
};

export type LogSourceKind = Extract<BufferState['kind'], 'channel' | 'query'>;

export type LogSource = {
  aliases: string[];
  buffer: BufferState;
  firstMessageTs: number | null;
  lastMessageTs: number | null;
  messageCount: number;
  open: boolean;
};

export type LogSourceListFilters = {
  kind?: LogSourceKind | null;
  networkId?: string | null;
  q?: string | null;
};

export type LogSourceListPayload = LogSourceListFilters & {
  sources: LogSource[];
};
