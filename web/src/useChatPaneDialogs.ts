import { useCallback, useReducer, useState } from 'react';
import type { BufferState } from '../../shared/protocol-chat.js';

type UseChatPaneDialogsParams = {
  canDeleteHistory?: boolean;
  onDeleteHistory?: (buffer: BufferState) => Promise<boolean>;
  selectedBuffer: BufferState | null;
};

export function useChatPaneDialogs(params: UseChatPaneDialogsParams) {
  const [historySearchOpen, setHistorySearchOpen] =
    useReducer((_open: boolean, nextOpen: boolean) => nextOpen, false);
  const [deleteHistoryBuffer, setDeleteHistoryBuffer] = useState<BufferState | null>(null);
  const [deleteHistoryPending, setDeleteHistoryPending] = useState(false);
  const clearableBuffer = params.canDeleteHistory && params.selectedBuffer?.kind === 'query'
    ? params.selectedBuffer
    : null;

  const handleConfirmDeleteHistory = useCallback(async () => {
    if (!deleteHistoryBuffer || !params.onDeleteHistory) {
      return;
    }
    setDeleteHistoryPending(true);
    try {
      const deleted = await params.onDeleteHistory(deleteHistoryBuffer);
      if (deleted) {
        setDeleteHistoryBuffer(null);
      }
    } finally {
      setDeleteHistoryPending(false);
    }
  }, [deleteHistoryBuffer, params.onDeleteHistory]);

  return {
    clearableBuffer,
    deleteHistoryBuffer,
    deleteHistoryPending,
    historySearchOpen,
    closeDeleteHistory: () => setDeleteHistoryBuffer(null),
    confirmDeleteHistory: handleConfirmDeleteHistory,
    openDeleteHistory: () => {
      if (clearableBuffer) {
        setDeleteHistoryBuffer(clearableBuffer);
      }
    },
    openHistorySearch: () => setHistorySearchOpen(true),
    setHistorySearchOpen,
  };
}
