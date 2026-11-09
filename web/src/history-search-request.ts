import type { LatestRequest } from './latest-request.js';
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
  requests: LatestRequest;
  search: SearchBufferHistory;
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
  requests: LatestRequest;
  search: SearchLogs;
  onLoaded: (payload: LogHistorySearchPayload) => void;
  onError: (message: string) => void;
  onSettled: () => void;
};

export async function runHistorySearchRequest({
  bufferId,
  query,
  requests,
  search,
  onLoaded,
  onError,
  onSettled,
}: RunHistorySearchRequestParams) {
  await requests.run({
    load: (signal) => search(bufferId, query, { signal }),
    onLoaded,
    onError: error => onError(error instanceof Error ? error.message : 'Failed to search history'),
    onSettled,
  });
}

export async function runLogSearchRequest({
  filters,
  query,
  requests,
  search,
  onLoaded,
  onError,
  onSettled,
}: RunLogSearchRequestParams) {
  await requests.run({
    load: (signal) => search(query, filters, { signal }),
    onLoaded,
    onError: error => onError(error instanceof Error ? error.message : 'Failed to search history'),
    onSettled,
  });
}
