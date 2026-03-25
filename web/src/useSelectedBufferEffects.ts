import { useCallback, useEffect, useRef } from 'react';
import type { BufferState, ChatMessage } from '../../shared/protocol.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { Action, GatewayStatus } from './app-types.js';
import { api, type BufferHistoryPayload } from './client.js';

type UseSelectedBufferEffectsParams = {
  applyServerMessages: ApplyServerMessages;
  dispatch: (action: Action) => void;
  gatewayStatus: GatewayStatus;
  historyHasOlderByBufferId: Record<string, boolean>;
  historyLoadedByBufferId: Record<string, true>;
  historyLoadingOlder: boolean;
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
  isLoadingOlderHistory: boolean;
  loadOlderHistory: () => Promise<void>;
};

export function useSelectedBufferEffects(params: UseSelectedBufferEffectsParams): SelectedBufferHistoryControls {
  const historyRequestRef = useRef(0);
  const selectedBufferId = params.selectedBuffer?.id ?? null;
  const hasLoadedHistory = selectedBufferId
    ? params.historyLoadedByBufferId[selectedBufferId] === true
    : false;
  const hasOlderHistory = selectedBufferId
    ? params.historyHasOlderByBufferId[selectedBufferId] === true
    : false;

  useEffect(() => {
    const unread = params.selectedBuffer?.unread ?? 0;
    if (params.selectedBuffer && unread > 0) {
      api.markBufferRead(params.selectedBuffer.id)
        .then((payload) => params.applyServerMessages(payload.messages))
        .catch(() => undefined);
    }
  }, [params.applyServerMessages, params.selectedBuffer?.id, params.selectedBuffer?.unread]);

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
    await loadOlderBufferHistory({
      beforeMessageId: params.selectedMessages[0]?.id ?? null,
      bufferId: selectedBufferId,
      gatewayStatus: params.gatewayStatus,
      dispatch: params.dispatch,
      loadHistory: api.loadHistory,
    });
  }, [params.dispatch, params.gatewayStatus, params.selectedMessages, selectedBufferId]);

  return {
    canLoadOlderHistory:
      !!selectedBufferId
      && params.selectedBuffer?.kind !== 'server'
      && params.selectedMessages.length > 0
      && hasOlderHistory,
    isLoadingOlderHistory: params.historyLoadingOlder,
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
  if (!bufferId || gatewayStatus !== 'connected') {
    dispatch({ type: 'set-history-loading', value: false });
    return;
  }
  if (hasLoadedHistory) {
    dispatch({ type: 'set-history-loading', value: false });
    return;
  }
  dispatch({ type: 'set-history-loading', value: true });
  try {
    const payload = await loadHistory(bufferId);
    if (!isCurrentRequest()) {
      return;
    }
    applyHistoryPayload(dispatch, bufferId, payload, 'append-messages');
    dispatch({ type: 'set-history-loading', value: false });
  } catch {
    if (!isCurrentRequest()) {
      return;
    }
    dispatch({ type: 'set-history-loading', value: false });
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } });
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
    dispatch({ type: 'set-history-loading-older', value: false });
    return;
  }
  dispatch({ type: 'set-history-loading-older', value: true });
  try {
    const payload = await loadHistory(bufferId, undefined, beforeMessageId);
    applyHistoryPayload(dispatch, bufferId, payload, 'prepend-messages');
    dispatch({ type: 'set-history-loading-older', value: false });
  } catch {
    dispatch({ type: 'set-history-loading-older', value: false });
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load older history' } });
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
