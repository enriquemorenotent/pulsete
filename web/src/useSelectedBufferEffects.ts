import { useEffect, useRef } from 'react';
import type { BufferState } from '../../shared/protocol.js';
import type { Action, GatewayStatus } from './app-types.js';
import { api } from './client.js';
import { dispatchServerMessage } from './server-message-actions.js';

type UseSelectedBufferEffectsParams = {
  dispatch: (action: Action) => void;
  gatewayStatus: GatewayStatus;
  selectedBuffer: BufferState | null;
};

type LoadSelectedBufferHistoryParams = {
  bufferId: string | null;
  gatewayStatus: GatewayStatus;
  dispatch: (action: Action) => void;
  loadHistory: typeof api.loadHistory;
  isCurrentRequest: () => boolean;
};

export function useSelectedBufferEffects(params: UseSelectedBufferEffectsParams) {
  const historyRequestRef = useRef(0);

  useEffect(() => {
    const unread = params.selectedBuffer?.unread ?? 0;
    if (params.selectedBuffer && unread > 0) {
      api.markBufferRead(params.selectedBuffer.id)
        .then((payload) => dispatchServerMessage({ type: 'buffer.upsert', buffer: payload.buffer }, params.dispatch))
        .catch(() => undefined);
    }
  }, [params.dispatch, params.selectedBuffer?.id, params.selectedBuffer?.unread]);

  useEffect(() => {
    historyRequestRef.current += 1;
    const requestId = historyRequestRef.current;
    let active = true;
    void loadSelectedBufferHistory({
      bufferId: params.selectedBuffer?.id ?? null,
      gatewayStatus: params.gatewayStatus,
      dispatch: params.dispatch,
      loadHistory: api.loadHistory,
      isCurrentRequest: () => active && historyRequestRef.current === requestId,
    });
    return () => {
      active = false;
    };
  }, [params.dispatch, params.gatewayStatus, params.selectedBuffer?.id]);
}

export async function loadSelectedBufferHistory({
  bufferId,
  gatewayStatus,
  dispatch,
  loadHistory,
  isCurrentRequest,
}: LoadSelectedBufferHistoryParams) {
  if (!bufferId || gatewayStatus !== 'connected') {
    dispatch({ type: 'set-history-loading', value: false });
    return;
  }
  dispatch({ type: 'set-history-loading', value: true });
  try {
    const payload = await loadHistory(bufferId);
    if (!isCurrentRequest()) {
      return;
    }
    dispatch({ type: 'append-messages', messages: payload.messages });
    dispatch({ type: 'set-history-loading', value: false });
  } catch {
    if (!isCurrentRequest()) {
      return;
    }
    dispatch({ type: 'set-history-loading', value: false });
    dispatch({ type: 'set-banner', banner: { kind: 'error', message: 'Failed to load history' } });
  }
}
