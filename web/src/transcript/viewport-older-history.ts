import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  resolveNextFirstItemIndex,
  resolvePrependedRowCountFromAnchor,
} from './viewport-positioning.js';

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

  useLayoutEffect(() => {
    const anchorKey = pendingOlderHistoryAnchorKeyRef.current;
    if (!anchorKey) {
      return;
    }

    const prependedRowCount = resolvePrependedRowCountFromAnchor(
      anchorKey,
      params.rowKeys,
    );
    if (prependedRowCount !== null && prependedRowCount > 0) {
      params.setFirstItemIndex((current) =>
        resolveNextFirstItemIndex(current, prependedRowCount),
      );
      pendingOlderHistoryAnchorKeyRef.current = null;
      return;
    }

    if (!params.loadingOlderHistory) {
      pendingOlderHistoryAnchorKeyRef.current = null;
    }
  }, [params.loadingOlderHistory, params.rowKeys, params.setFirstItemIndex]);

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
