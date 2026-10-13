import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type SetFirstItemIndex = (value: number | ((current: number) => number)) => void;

type UseTranscriptOlderHistoryParams = {
  loadingOlderHistory: boolean;
  onLoadOlderHistory?: () => Promise<number>;
  rowKeys: readonly string[];
  setFirstItemIndex: SetFirstItemIndex;
};

export const useTranscriptOlderHistory = (
  params: UseTranscriptOlderHistoryParams,
) => {
  const loadingOlderRef = useRef(false);
  const pendingOlderHistoryAnchorKeyRef = useRef<string | null>(null);

  const resetOlderHistory = useCallback(() => {
    loadingOlderRef.current = false;
    pendingOlderHistoryAnchorKeyRef.current = null;
  }, []);

  // Update the index together with the rows, before Virtuoso sees either change.
  const [previousRows, setPreviousRows] = useState(params.rowKeys);
  if (previousRows !== params.rowKeys) {
    setPreviousRows(params.rowKeys);
    const nextIndexes = new Map(params.rowKeys.map((key, index) => [key, index]));
    const previousIndex = previousRows.findIndex((key) =>
      !key.startsWith('day-divider:') && !key.startsWith('unread-divider:') && nextIndexes.has(key));
    if (previousIndex >= 0) {
      const nextIndex = nextIndexes.get(previousRows[previousIndex]!)!;
      const delta = previousIndex - nextIndex;
      if (delta) params.setFirstItemIndex((current) => Math.max(1, current + delta));
    }
  }
  useLayoutEffect(() => {
    if (!params.loadingOlderHistory) pendingOlderHistoryAnchorKeyRef.current = null;
  }, [params.rowKeys, params.loadingOlderHistory]);

  const handleLoadOlderHistory = useCallback(async () => {
    if (
      !params.onLoadOlderHistory
      || loadingOlderRef.current
      || params.loadingOlderHistory
      || pendingOlderHistoryAnchorKeyRef.current
    ) {
      return 0;
    }

    loadingOlderRef.current = true;
    pendingOlderHistoryAnchorKeyRef.current = params.rowKeys[0] ?? null;
    try {
      const loadedMessageCount = await params.onLoadOlderHistory();
      if (loadedMessageCount <= 0) {
        pendingOlderHistoryAnchorKeyRef.current = null;
      }
      return loadedMessageCount;
    } catch {
      pendingOlderHistoryAnchorKeyRef.current = null;
      return 0;
    } finally {
      loadingOlderRef.current = false;
    }
  }, [params.loadingOlderHistory, params.onLoadOlderHistory, params.rowKeys]);

  return {
    handleLoadOlderHistory,
    resetOlderHistory,
  };
};
