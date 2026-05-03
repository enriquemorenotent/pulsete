import { useCallback, useEffect, useRef, useState } from 'react';
import type { BufferState, ChatMessage } from '../../../shared/protocol-chat.js';
import type { Action, GatewayStatus } from '../app-types.js';
import { api, type BufferHistoryPayload } from '../client.js';

type UseSelectedBufferHistoryParams = {
  dispatch: (action: Action) => void;
  gatewayStatus: GatewayStatus;
  historyHasOlderByBufferId: Record<string, boolean>;
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
};

export type SelectedBufferHistoryControls = {
  canLoadOlderHistory: boolean;
  initialHistoryPending: boolean;
  isLoadingOlderHistory: boolean;
  loadOlderHistory: () => Promise<number>;
};

export function useSelectedBufferHistory(params: UseSelectedBufferHistoryParams): SelectedBufferHistoryControls {
  const historyRequestRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const selectedBufferId = params.selectedBuffer?.id ?? null;
  const oldestSelectedMessageId = params.selectedMessages[0]?.id ?? null;
  const hasLoadedHistory = selectedBufferId
    ? params.historyLoadedByBufferId[selectedBufferId] === true
    : false;
  const hasOlderHistory = selectedBufferId
    ? params.historyHasOlderByBufferId[selectedBufferId] === true
    : false;
  const initialHistoryPending =
    !!selectedBufferId
    && params.gatewayStatus === 'connected'
    && !hasLoadedHistory;

  useEffect(() => {
    historyRequestRef.current += 1;
    const requestId = historyRequestRef.current;
    let active = true;
    void loadSelectedBufferHistory({
      bufferId: selectedBufferId,
      gatewayStatus: params.gatewayStatus,
      hasLoadedHistory,
      dispatch: params.dispatch,
      loadHistory: api.loadHistory,
      isCurrentRequest: () => active && historyRequestRef.current === requestId,
    });
    return () => {
      active = false;
    };
  }, [params.dispatch, params.gatewayStatus, hasLoadedHistory, selectedBufferId]);

  const loadOlderHistory = useCallback(async () => {
    if (loadingOlderRef.current) {
      return 0;
    }
    loadingOlderRef.current = true;
    setLoadingOlderHistory(true);
    try {
      return await loadOlderBufferHistory({
        beforeMessageId: oldestSelectedMessageId,
        bufferId: selectedBufferId,
        gatewayStatus: params.gatewayStatus,
        dispatch: params.dispatch,
        loadHistory: api.loadHistory,
      });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderHistory(false);
    }
  }, [oldestSelectedMessageId, params.dispatch, params.gatewayStatus, selectedBufferId]);

  return {
    canLoadOlderHistory:
      !!selectedBufferId
      && params.selectedBuffer?.kind !== 'server'
      && params.selectedMessages.length > 0
      && hasOlderHistory,
    initialHistoryPending,
    isLoadingOlderHistory: loadingOlderHistory,
    loadOlderHistory,
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
}: LoadOlderBufferHistoryParams) {
  if (!bufferId || !beforeMessageId || gatewayStatus !== 'connected') {
    return 0;
  }
  try {
    const payload = await loadHistory(bufferId, undefined, beforeMessageId);
    applyHistoryPayload(dispatch, bufferId, payload, 'prepend-messages');
    return payload.messages.length;
  } catch {
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
  dispatch({ type: 'history-buffer-loaded', bufferId, hasOlder: payload.hasMore });
};
