import { useCallback, useEffect, useRef, useState } from 'react';
import { historyWindowLimit, type BufferState, type ChatMessage } from '../../../shared/protocol-chat.js';
import type { Action, GatewayStatus } from '../app-types.js';
import { api, type BufferHistoryPayload } from '../client.js';

type UseSelectedBufferHistoryParams = {
  dispatch: (action: Action) => void;
  gatewayStatus: GatewayStatus;
  historyHasOlderByBufferId: Record<string, boolean>;
  historyHasNewerByBufferId: Record<string, boolean>;
  historyLoadedByBufferId: Record<string, true>;
  selectedBuffer: BufferState | null;
  selectedMessages: ChatMessage[];
};

type LoadSelectedBufferHistoryParams = {
  bufferId: string | null;
  gatewayStatus: GatewayStatus;
  hasLoadedHistory: boolean;
  dispatch: (action: Action) => void;
  loadHistory: typeof api.loadHistory;
  isCurrentRequest: () => boolean;
};

type LoadOlderBufferHistoryParams = {
  beforeMessageId: string | null;
  bufferId: string | null;
  gatewayStatus: GatewayStatus;
  dispatch: (action: Action) => void;
  loadHistory: typeof api.loadHistory;
  isCurrentRequest: () => boolean;
};

export type SelectedBufferHistoryControls = {
  canLoadOlderHistory: boolean;
  hasNewerHistory: boolean;
  initialHistoryPending: boolean;
  isLoadingOlderHistory: boolean;
  loadOlderHistory: () => Promise<number>;
  loadNewerHistory?: () => Promise<number>;
};

export function useSelectedBufferHistory(params: UseSelectedBufferHistoryParams): SelectedBufferHistoryControls {
  const historyRequestRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const [initialHistoryRequest, setInitialHistoryRequest] = useState<{
    bufferId: string;
    pending: boolean;
  } | null>(null);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const selectedBufferId = params.selectedBuffer?.id ?? null;
  const oldestSelectedMessageId = params.selectedMessages[0]?.id ?? null;
  const hasLoadedHistory = selectedBufferId
    ? params.historyLoadedByBufferId[selectedBufferId] === true
    : false;
  const hasOlderHistory = selectedBufferId
    ? params.historyHasOlderByBufferId[selectedBufferId] === true
    : false;
  const hasNewerHistory = selectedBufferId
    ? params.historyHasNewerByBufferId[selectedBufferId] === true
    : false;
  const shouldLoadInitialHistory =
    !!selectedBufferId
    && params.gatewayStatus === 'connected'
    && !hasLoadedHistory;
  const initialHistoryPending =
    shouldLoadInitialHistory
    && (
      initialHistoryRequest?.bufferId !== selectedBufferId
      || initialHistoryRequest.pending
    );

  useEffect(() => {
    historyRequestRef.current += 1;
    const requestId = historyRequestRef.current;
    let active = true;
    if (!shouldLoadInitialHistory) {
      setInitialHistoryRequest(null);
    } else if (selectedBufferId) {
      setInitialHistoryRequest({ bufferId: selectedBufferId, pending: true });
    }
    void loadSelectedBufferHistory({
      bufferId: selectedBufferId,
      gatewayStatus: params.gatewayStatus,
      hasLoadedHistory,
      dispatch: params.dispatch,
      loadHistory: api.loadHistory,
      isCurrentRequest: () => active && historyRequestRef.current === requestId,
    }).finally(() => {
      if (active && historyRequestRef.current === requestId && selectedBufferId) {
        setInitialHistoryRequest({ bufferId: selectedBufferId, pending: false });
      }
    });
    return () => {
      active = false;
    };
  }, [
    params.dispatch,
    params.gatewayStatus,
    hasLoadedHistory,
    selectedBufferId,
    shouldLoadInitialHistory,
  ]);

  const loadOlderHistory = useCallback(async () => {
    if (loadingOlderRef.current) {
      return 0;
    }
    loadingOlderRef.current = true;
    setLoadingOlderHistory(true);
    const requestId = historyRequestRef.current;
    try {
      return await loadOlderBufferHistory({
        beforeMessageId: oldestSelectedMessageId,
        bufferId: selectedBufferId,
        gatewayStatus: params.gatewayStatus,
        dispatch: params.dispatch,
        loadHistory: api.loadHistory,
        isCurrentRequest: () => historyRequestRef.current === requestId,
      });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderHistory(false);
    }
  }, [oldestSelectedMessageId, params.dispatch, params.gatewayStatus, selectedBufferId]);

  const newestSelectedMessageId = params.selectedMessages.at(-1)?.id;
  const loadNewerHistory = useCallback(async () => {
    if (loadingOlderRef.current || !selectedBufferId || !newestSelectedMessageId
      || params.gatewayStatus !== 'connected' || !hasNewerHistory) return 0;
    loadingOlderRef.current = true;
    setLoadingOlderHistory(true);
    const requestId = historyRequestRef.current;
    try {
      const payload = await api.loadMessageHistoryWindow(selectedBufferId, newestSelectedMessageId);
      if (historyRequestRef.current !== requestId) return 0;
      const cursorIndex = payload.messages.findIndex(({ id }) => id === newestSelectedMessageId);
      if (cursorIndex < 0) return 0;
      const messages = payload.messages.slice(cursorIndex + 1);
      params.dispatch({ type: 'page-message-window', bufferId: selectedBufferId,
        cursor: newestSelectedMessageId, direction: 'newer', messages, hasMore: payload.hasNewer });
      return messages.length;
    } catch {
      if (historyRequestRef.current === requestId) params.dispatch({ type: 'set-banner',
        banner: { kind: 'error', message: 'Failed to load newer history' } });
      return 0;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderHistory(false);
    }
  }, [selectedBufferId, newestSelectedMessageId, params.gatewayStatus, hasNewerHistory, params.dispatch]);

  return {
    canLoadOlderHistory:
      !!selectedBufferId
      && params.selectedBuffer?.kind !== 'server'
      && params.selectedMessages.length > 0
      && hasOlderHistory,
    hasNewerHistory,
    initialHistoryPending,
    isLoadingOlderHistory: loadingOlderHistory,
    loadOlderHistory,
    loadNewerHistory: hasNewerHistory ? loadNewerHistory : undefined,
  };
}

export async function loadSelectedBufferHistory({
  bufferId,
  gatewayStatus,
  hasLoadedHistory,
  dispatch,
  loadHistory,
  isCurrentRequest,
}: LoadSelectedBufferHistoryParams) {
  if (!bufferId || gatewayStatus !== 'connected' || hasLoadedHistory) {
    return 0;
  }
  try {
    const payload = await loadHistory(bufferId);
    if (!isCurrentRequest()) {
      return 0;
    }
    applyHistoryPayload(dispatch, bufferId, payload, 'append-messages');
    return payload.messages.length;
  } catch {
    if (!isCurrentRequest()) {
      return 0;
    }
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } });
    return 0;
  }
}

export async function loadOlderBufferHistory({
  beforeMessageId,
  bufferId,
  gatewayStatus,
  dispatch,
  loadHistory,
  isCurrentRequest,
}: LoadOlderBufferHistoryParams) {
  if (!bufferId || !beforeMessageId || gatewayStatus !== 'connected') {
    return 0;
  }
  try {
    const payload = await loadHistory(bufferId, historyWindowLimit, beforeMessageId);
    if (!isCurrentRequest()) {
      return 0;
    }
    dispatch({ type: 'page-message-window', bufferId, cursor: beforeMessageId,
      direction: 'older', messages: payload.messages, hasMore: payload.hasMore });
    return payload.messages.length;
  } catch {
    if (!isCurrentRequest()) {
      return 0;
    }
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load older history' } });
    return 0;
  }
}

const applyHistoryPayload = (
  dispatch: (action: Action) => void,
  bufferId: string,
  payload: BufferHistoryPayload,
  type: 'append-messages' | 'prepend-messages',
) => {
  dispatch({ type, messages: payload.messages });
  dispatch(type === 'append-messages'
    ? {
        type: 'history-buffer-loaded',
        bufferId,
        hasOlder: payload.hasMore,
        hasNewer: false,
      }
    : {
        type: 'history-buffer-loaded',
        bufferId,
        hasOlder: payload.hasMore,
      });
};
