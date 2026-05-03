import { useEffect, useRef } from 'react';
import type { BufferState } from '../../../shared/protocol-chat.js';
import type { ServerMessage } from '../../../shared/protocol-messages.js';
import type { ApplyServerMessages } from '../app-actions-types.js';
import { api } from '../client.js';
import { shouldMarkSelectedBufferRead } from './unread-state.js';

type MarkBufferRead = (
  bufferId: string,
  init?: Pick<RequestInit, 'signal'>,
) => Promise<{ buffer: BufferState; messages: ServerMessage[] }>;

type MarkSelectedBufferReadParams = {
  bufferId: string;
  applyServerMessages: ApplyServerMessages;
  markBufferRead: MarkBufferRead;
  signal: AbortSignal;
  isCurrentRequest: () => boolean;
  onSettled: () => void;
};

type UseSelectedBufferReadReceiptParams = {
  applyServerMessages: ApplyServerMessages;
  documentVisible: boolean;
  selectedBuffer: BufferState | null;
  windowFocused: boolean;
};

export function useSelectedBufferReadReceipt(params: UseSelectedBufferReadReceiptParams) {
  const readRequestAbortRef = useRef<AbortController | null>(null);
  const readRequestBufferIdRef = useRef<string | null>(null);
  const readRequestRef = useRef(0);
  const readRequestsMountedRef = useRef(true);

  useEffect(() => {
    readRequestsMountedRef.current = true;
    return () => {
      readRequestsMountedRef.current = false;
      readRequestRef.current += 1;
      readRequestBufferIdRef.current = null;
      readRequestAbortRef.current?.abort();
      readRequestAbortRef.current = null;
    };
  }, []);

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
    readRequestAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    readRequestBufferIdRef.current = requestBufferId;
    readRequestAbortRef.current = controller;
    void markSelectedBufferRead({
      bufferId: requestBufferId,
      applyServerMessages: params.applyServerMessages,
      markBufferRead: api.markBufferRead,
      signal: controller.signal,
      isCurrentRequest: () =>
        readRequestsMountedRef.current
        && readRequestRef.current === requestId
        && readRequestBufferIdRef.current === requestBufferId,
      onSettled: () => {
        if (readRequestAbortRef.current === controller) {
          readRequestAbortRef.current = null;
        }
        if (readRequestBufferIdRef.current === requestBufferId) {
          readRequestBufferIdRef.current = null;
        }
      },
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
      readRequestRef.current += 1;
      readRequestBufferIdRef.current = null;
      readRequestAbortRef.current?.abort();
      readRequestAbortRef.current = null;
    }
  }, [params.documentVisible, params.selectedBuffer, params.windowFocused]);
}

export async function markSelectedBufferRead({
  bufferId,
  applyServerMessages,
  markBufferRead,
  signal,
  isCurrentRequest,
  onSettled,
}: MarkSelectedBufferReadParams) {
  try {
    const payload = await markBufferRead(bufferId, { signal });
    if (isCurrentRequest()) {
      applyServerMessages(payload.messages);
    }
  } catch {
    // Read receipts are opportunistic; connection failures are reflected by the gateway state.
  } finally {
    if (isCurrentRequest()) {
      onSettled();
    }
  }
}
