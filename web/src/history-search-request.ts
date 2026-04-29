import type { BufferHistorySearchPayload } from '../../shared/protocol.js';

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
  try {
    const payload = await search(bufferId, query, { signal });
    if (isCurrentRequest()) {
      onLoaded(payload);
    }
  } catch (error) {
    if (isCurrentRequest()) {
      onError(error instanceof Error ? error.message : 'Failed to search history');
    }
  } finally {
    if (isCurrentRequest()) {
      onSettled();
    }
  }
}
