import { useCallback, useRef, useState } from 'react';

export type ComposerHistoryState = {
  entries: string[];
  index: number | null;
  draftBeforeNavigation: string;
};

export type ComposerHistoryStep = {
  state: ComposerHistoryState;
  draft: string;
};

export type ComposerController = {
  draft: string;
  setDraft: (value: string) => void;
  recordComposerEntry: (entry: string) => void;
  recallOlderDraft: () => void;
  recallNewerDraft: () => void;
};

export const composerHistoryLimit = 100;

export const initialComposerHistoryState: ComposerHistoryState = {
  entries: [],
  index: null,
  draftBeforeNavigation: '',
};

export const pushComposerHistoryEntry = (
  state: ComposerHistoryState,
  entry: string,
  limit = composerHistoryLimit
): ComposerHistoryState => {
  const value = entry.trim();
  if (!value) {
    return state;
  }
  const entries = [...state.entries, value];
  return {
    entries: entries.slice(-limit),
    index: null,
    draftBeforeNavigation: '',
  };
};

export const stepComposerHistory = (
  state: ComposerHistoryState,
  direction: 'older' | 'newer',
  currentDraft: string
): ComposerHistoryStep | null => {
  if (state.entries.length === 0) {
    return null;
  }

  if (direction === 'older') {
    const nextIndex = state.index === null ? state.entries.length - 1 : Math.max(0, state.index - 1);
    return {
      state: {
        entries: state.entries,
        index: nextIndex,
        draftBeforeNavigation: state.index === null ? currentDraft : state.draftBeforeNavigation,
      },
      draft: state.entries[nextIndex] ?? currentDraft,
    };
  }

  if (state.index === null) {
    return null;
  }

  const nextIndex = state.index + 1;
  if (nextIndex >= state.entries.length) {
    return {
      state: {
        entries: state.entries,
        index: null,
        draftBeforeNavigation: '',
      },
      draft: state.draftBeforeNavigation,
    };
  }

  return {
    state: {
      entries: state.entries,
      index: nextIndex,
      draftBeforeNavigation: state.draftBeforeNavigation,
    },
    draft: state.entries[nextIndex] ?? currentDraft,
  };
};

export const useComposerHistory = (): ComposerController => {
  const [draft, setDraftState] = useState('');
  const [, setHistoryState] = useState(initialComposerHistoryState);
  const draftRef = useRef(draft);
  const historyStateRef = useRef(initialComposerHistoryState);

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
  }, []);

  const recordComposerEntry = useCallback((entry: string) => {
    setHistoryState((current) => {
      const nextState = pushComposerHistoryEntry(current, entry);
      historyStateRef.current = nextState;
      return nextState;
    });
  }, []);

  const recallOlderDraft = useCallback(() => {
    const result = stepComposerHistory(historyStateRef.current, 'older', draftRef.current);
    if (!result) {
      return;
    }
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    setDraft(result.draft);
  }, [setDraft]);

  const recallNewerDraft = useCallback(() => {
    const result = stepComposerHistory(historyStateRef.current, 'newer', draftRef.current);
    if (!result) {
      return;
    }
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    setDraft(result.draft);
  }, [setDraft]);

  return {
    draft,
    setDraft,
    recordComposerEntry,
    recallOlderDraft,
    recallNewerDraft,
  };
};
