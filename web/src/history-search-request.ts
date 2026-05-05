import type {
  BufferHistorySearchPayload,
  LogHistorySearchFilters,
  LogHistorySearchPayload,
} from '../../shared/protocol-chat.js';

export type SearchBufferHistory = (
  bufferId: string,
  query: string,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<BufferHistorySearchPayload>;

type RunHistorySearchRequestParams = {
  bufferId: string;
  query: string;
  signal: AbortSignal;
  search: SearchBufferHistory;
  isCurrentRequest: () => boolean;
  onLoaded: (payload: BufferHistorySearchPayload) => void;
  onError: (message: string) => void;
  onSettled: () => void;
};

export type SearchLogs = (
  query: string,
  filters?: LogHistorySearchFilters,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<LogHistorySearchPayload>;

type RunLogSearchRequestParams = {
  filters: LogHistorySearchFilters;
  query: string;
  signal: AbortSignal;
  search: SearchLogs;
  isCurrentRequest: () => boolean;
  onLoaded: (payload: LogHistorySearchPayload) => void;
  onError: (message: string) => void;
  onSettled: () => void;
};

export async function runHistorySearchRequest({
  bufferId,
  query,
  signal,
  search,
  isCurrentRequest,
  onLoaded,
  onError,
  onSettled,
}: RunHistorySearchRequestParams) {
  await runSearchRequest({
    load: () => search(bufferId, query, { signal }),
    fallbackError: 'Failed to search history',
    isCurrentRequest,
    onLoaded,
    onError,
    onSettled,
  });
}

export async function runLogSearchRequest({
  filters,
  query,
  signal,
  search,
  isCurrentRequest,
  onLoaded,
  onError,
  onSettled,
}: RunLogSearchRequestParams) {
  await runSearchRequest({
    load: () => search(query, filters, { signal }),
    fallbackError: 'Failed to search logs',
    isCurrentRequest,
    onLoaded,
    onError,
    onSettled,
  });
}

async function runSearchRequest<TPayload>({
  load,
  fallbackError,
  isCurrentRequest,
  onLoaded,
  onError,
  onSettled,
}: {
  load: () => Promise<TPayload>;
  fallbackError: string;
  isCurrentRequest: () => boolean;
  onLoaded: (payload: TPayload) => void;
  onError: (message: string) => void;
  onSettled: () => void;
}) {
  try {
    const payload = await load();
    if (isCurrentRequest()) {
      onLoaded(payload);
    }
  } catch (error) {
    if (isCurrentRequest()) {
      onError(error instanceof Error ? error.message : fallbackError);
    }
  } finally {
    if (isCurrentRequest()) {
      onSettled();
    }
  }
}
