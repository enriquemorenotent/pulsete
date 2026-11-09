import { LatestRequest } from './latest-request.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LogHistorySearchFilters } from '../../shared/protocol-chat.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import { runLogSearchRequest, type SearchLogs } from './history-search-request.js';

const initialState: HistorySearchState = {
  status: 'idle', query: '', results: [], hasMore: false, error: null,
};

export function useLogHistorySearch(open: boolean, search: SearchLogs) {
  const [query, setQuery] = useState('');
  const [networkValue, setNetworkValue] = useState('__all__');
  const [bufferId, setBufferId] = useState('');
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const draftKey = JSON.stringify([query.trim(), networkValue, fromDate, toDate, bufferId]);
  const [state, setState] = useState(initialState);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [requests] = useState(() => new LatestRequest());
  const submittedRef = useRef<{ query: string; filters: LogHistorySearchFilters } | null>(null);

  useEffect(() => {
    requests.cancel();
    submittedRef.current = null;
    setQuery('');
    setNetworkValue('__all__');
    setBufferId('');
    setSubmittedKey(null);
    setFromDate('');
    setToDate('');
    setState(initialState);
    setLoadingMore(false);
    setPageError(null);
    return () => {
      requests.cancel();
    };
  }, [open, requests]);

  const load = async (submitted: { query: string; filters: LogHistorySearchFilters }, beforeMessageId?: string) => {
    setPageError(null);
    setLoadingMore(!!beforeMessageId);
    if (!beforeMessageId) setState({ ...initialState, status: 'loading', query: submitted.query });
    await runLogSearchRequest({
      requests, search, query: submitted.query,
      filters: { ...submitted.filters, beforeMessageId },
      onLoaded: payload => {
        setState((current) => ({
          status: 'loaded', query: payload.query, hasMore: payload.hasMore, error: null,
          results: beforeMessageId
            ? [...new Map([...current.results, ...payload.results].map((result) => [result.message.id, result])).values()]
            : payload.results,
        }));
      },
      onError: message => {
        if (beforeMessageId) setPageError(message);
        else setState({ ...initialState, status: 'error', query: submitted.query, error: message });
      },
      onSettled: () => setLoadingMore(false),
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fromDate && toDate && fromDate > toDate) return;
    const end = toDate ? new Date(`${toDate}T00:00:00`) : null;
    end?.setDate(end.getDate() + 1);
    const submitted = {
      query: query.trim(),
      filters: {
        bufferId: bufferId || undefined,
        networkId: bufferId || networkValue === '__all__' ? null : networkValue,
        fromTs: fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : undefined,
        toTs: end?.getTime(),
      },
    };
    submittedRef.current = submitted;
    setSubmittedKey(draftKey);
    void load(submitted);
  };

  const loadMore = () => {
    if (requests.pending || !state.hasMore || !submittedRef.current) return;
    const cursor = state.results.at(-1)?.message.id;
    if (cursor) void load(submittedRef.current, cursor);
  };

  return {
    bufferId, setBufferId, dirty: submittedKey !== null && submittedKey !== draftKey,
    query, setQuery, networkValue, setNetworkValue,
    fromDate, setFromDate, toDate, setToDate, state, loadingMore, pageError, submit, loadMore,
  };
}
