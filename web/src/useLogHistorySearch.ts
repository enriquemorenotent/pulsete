import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LogHistorySearchFilters } from '../../shared/protocol-chat.js';
import type { HistorySearchState } from './HistorySearchDialog.js';
import type { SearchLogs } from './history-search-request.js';

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
  const controllerRef = useRef<AbortController | null>(null);
  const submittedRef = useRef<{ query: string; filters: LogHistorySearchFilters } | null>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
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
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [open]);

  const load = async (submitted: { query: string; filters: LogHistorySearchFilters }, beforeMessageId?: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPageError(null);
    setLoadingMore(!!beforeMessageId);
    if (!beforeMessageId) setState({ ...initialState, status: 'loading', query: submitted.query });
    try {
      const payload = await search(submitted.query, { ...submitted.filters, beforeMessageId }, { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      setState((current) => ({
        status: 'loaded', query: payload.query, hasMore: payload.hasMore, error: null,
        results: beforeMessageId
          ? [...new Map([...current.results, ...payload.results].map((result) => [result.message.id, result])).values()]
          : payload.results,
      }));
    } catch (error) {
      if (controllerRef.current !== controller) return;
      const message = error instanceof Error ? error.message : 'Failed to search history';
      if (beforeMessageId) setPageError(message);
      else setState({ ...initialState, status: 'error', query: submitted.query, error: message });
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoadingMore(false);
      }
    }
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
    if (controllerRef.current || !state.hasMore || !submittedRef.current) return;
    const cursor = state.results.at(-1)?.message.id;
    if (cursor) void load(submittedRef.current, cursor);
  };

  return {
    bufferId, setBufferId, dirty: submittedKey !== null && submittedKey !== draftKey,
    query, setQuery, networkValue, setNetworkValue,
    fromDate, setFromDate, toDate, setToDate, state, loadingMore, pageError, submit, loadMore,
  };
}
