import { useCallback, useEffect, useRef } from 'react';
import type { BufferState, ChatMessage } from '../../shared/protocol.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { Action, GatewayStatus } from './app-types.js';
import { shouldMarkSelectedBufferRead } from './buffer-activity.js';
import { api, type BufferHistoryPayload } from './client.js';

type UseSelectedBufferEffectsParams = {
  applyServerMessages: ApplyServerMessages;
  dispatch: (action: Action) => void;
  documentVisible: boolean;
  gatewayStatus: GatewayStatus;
  historyHasOlderByBufferId: Record<string, boolean>;
  historyLoadedByBufferId: Record<string, true>;
  historyLoadingOlder: boolean;
  selectedBuffer: BufferState | null;
  selectedMessages: ChatMessage[];
  windowFocused: boolean;
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
  loadOlderHistory: () => Promise<void>;
};

export function useSelectedBufferEffects(params: UseSelectedBufferEffectsParams): SelectedBufferHistoryControls {
  const historyRequestRef = useRef(0);
  const readRequestBufferIdRef = useRef<string | null>(null);
  const selectedBufferId = params.selectedBuffer?.id ?? null;
  const hasLoadedHistory = selectedBufferId
    ? params.historyLoadedByBufferId[selectedBufferId] === true
    : false;
  const hasOlderHistory = selectedBufferId
    ? params.historyHasOlderByBufferId[selectedBufferId] === true
    : false;
  const initialHistoryPending =
    !!selectedBufferId &&
    params.gatewayStatus === 'connected' &&
    !hasLoadedHistory;

  useEffect(() => {
    if (!params.selectedBuffer) {
      return;
    }
    if (
      !shouldMarkSelectedBufferRead({
        selectedBuffer: params.selectedBuffer,
        documentVisible: params.documentVisible,
        windowFocused: params.windowFocused,
      })
      || readRequestBufferIdRef.current === params.selectedBuffer.id
    ) {
      return;
    }
    const requestBufferId = params.selectedBuffer.id;
    readRequestBufferIdRef.current = requestBufferId;
    api.markBufferRead(requestBufferId)
      .then((payload) => params.applyServerMessages(payload.messages))
      .catch(() => undefined)
      .finally(() => {
        if (readRequestBufferIdRef.current === requestBufferId) {
          readRequestBufferIdRef.current = null;
        }
      });
  }, [
    params.applyServerMessages,
    params.documentVisible,
    params.selectedBuffer,
    params.windowFocused,
  ]);

  useEffect(() => {
    if (
      !params.selectedBuffer
      || !shouldMarkSelectedBufferRead({
        selectedBuffer: params.selectedBuffer,
        documentVisible: params.documentVisible,
        windowFocused: params.windowFocused,
      })
    ) {
      readRequestBufferIdRef.current = null;
    }
  }, [params.documentVisible, params.selectedBuffer, params.windowFocused]);

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
    initialHistoryPending,
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
