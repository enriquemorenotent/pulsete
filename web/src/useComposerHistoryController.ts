import { useCallback, useRef, useState } from 'react';
import {
  hasStoredComposerDraft,
  initialComposerDraftState,
  pushComposerHistoryEntryForContext,
  readComposerDraft,
  setComposerDraftForContext,
  stepComposerHistoryForContext,
  type ComposerController,
  type ComposerDraftState,
} from './composer-history.js';

export const useComposerHistory = (): ComposerController => {
  const [, setDraftState] = useState(initialComposerDraftState);
  const draftStateRef = useRef(initialComposerDraftState);

  const updateDraftState = useCallback(
    (updater: (current: ComposerDraftState) => ComposerDraftState) => {
      setDraftState((current) => {
        const nextState = updater(current);
        draftStateRef.current = nextState;
        return nextState;
      });
    },
    [],
  );

  const getDraft = useCallback(
    (contextKey: string | null) =>
      readComposerDraft(draftStateRef.current, contextKey),
    [],
  );
  const hasDraft = useCallback(
    (contextKey: string | null) =>
      hasStoredComposerDraft(draftStateRef.current, contextKey),
    [],
  );

  return {
    getDraft,
    hasDraft,
    setDraft: useCallback(
      (contextKey, value) => {
        updateDraftState((current) =>
          setComposerDraftForContext(current, contextKey, value),
        );
      },
      [updateDraftState],
    ),
    recordComposerEntry: useCallback(
      (contextKey, entry) => {
        updateDraftState((current) =>
          pushComposerHistoryEntryForContext(current, contextKey, entry),
        );
      },
      [updateDraftState],
    ),
    recallOlderDraft: useCallback(
      (contextKey) => {
        updateDraftState((current) =>
          stepComposerHistoryForContext(current, contextKey, 'older'),
        );
      },
      [updateDraftState],
    ),
    recallNewerDraft: useCallback(
      (contextKey) => {
        updateDraftState((current) =>
          stepComposerHistoryForContext(current, contextKey, 'newer'),
        );
      },
      [updateDraftState],
    ),
  };
};
