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

export type ComposerContextState = {
  draft: string;
  history: ComposerHistoryState;
};

export type ComposerDraftState = Record<string, ComposerContextState>;

export type ComposerController = {
  getDraft: (contextKey: string | null) => string;
  hasDraft: (contextKey: string | null) => boolean;
  setDraft: (contextKey: string | null, value: string) => void;
  recordComposerEntry: (contextKey: string | null, entry: string) => void;
  recallOlderDraft: (contextKey: string | null) => void;
  recallNewerDraft: (contextKey: string | null) => void;
};

export const composerHistoryLimit = 100;

export const initialComposerHistoryState: ComposerHistoryState = {
  entries: [],
  index: null,
  draftBeforeNavigation: '',
};

export const initialComposerContextState: ComposerContextState = {
  draft: '',
  history: initialComposerHistoryState,
};

export const initialComposerDraftState: ComposerDraftState = {};

export const pushComposerHistoryEntry = (
  state: ComposerHistoryState,
  entry: string,
  limit = composerHistoryLimit,
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
  currentDraft: string,
): ComposerHistoryStep | null => {
  if (state.entries.length === 0) {
    return null;
  }

  if (direction === 'older') {
    const nextIndex =
      state.index === null
        ? state.entries.length - 1
        : Math.max(0, state.index - 1);
    return {
      state: {
        entries: state.entries,
        index: nextIndex,
        draftBeforeNavigation:
          state.index === null ? currentDraft : state.draftBeforeNavigation,
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

export const readComposerDraft = (
  state: ComposerDraftState,
  contextKey: string | null,
) => (contextKey ? (state[contextKey]?.draft ?? '') : '');

export const hasStoredComposerDraft = (
  state: ComposerDraftState,
  contextKey: string | null,
) => readComposerDraft(state, contextKey).trim().length > 0;

export const setComposerDraftForContext = (
  state: ComposerDraftState,
  contextKey: string | null,
  draft: string,
): ComposerDraftState => {
  if (!contextKey) {
    return state;
  }
  const current = state[contextKey] ?? initialComposerContextState;
  if (current.draft === draft) {
    return state;
  }
  return writeComposerContextState(state, contextKey, {
    draft,
    history: current.history,
  });
};

export const pushComposerHistoryEntryForContext = (
  state: ComposerDraftState,
  contextKey: string | null,
  entry: string,
  limit = composerHistoryLimit,
): ComposerDraftState => {
  if (!contextKey) {
    return state;
  }
  const current = state[contextKey] ?? initialComposerContextState;
  const nextHistory = pushComposerHistoryEntry(current.history, entry, limit);
  if (nextHistory === current.history) {
    return state;
  }
  return writeComposerContextState(state, contextKey, {
    draft: current.draft,
    history: nextHistory,
  });
};

export const stepComposerHistoryForContext = (
  state: ComposerDraftState,
  contextKey: string | null,
  direction: 'older' | 'newer',
): ComposerDraftState => {
  if (!contextKey) {
    return state;
  }
  const current = state[contextKey] ?? initialComposerContextState;
  const result = stepComposerHistory(current.history, direction, current.draft);
  if (!result) {
    return state;
  }
  return writeComposerContextState(state, contextKey, {
    draft: result.draft,
    history: result.state,
  });
};

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

  const setDraft = useCallback(
    (contextKey: string | null, value: string) => {
      updateDraftState((current) =>
        setComposerDraftForContext(current, contextKey, value),
      );
    },
    [updateDraftState],
  );

  const recordComposerEntry = useCallback(
    (contextKey: string | null, entry: string) => {
      updateDraftState((current) =>
        pushComposerHistoryEntryForContext(current, contextKey, entry),
      );
    },
    [updateDraftState],
  );

  const recallOlderDraft = useCallback(
    (contextKey: string | null) => {
      updateDraftState((current) =>
        stepComposerHistoryForContext(current, contextKey, 'older'),
      );
    },
    [updateDraftState],
  );

  const recallNewerDraft = useCallback(
    (contextKey: string | null) => {
      updateDraftState((current) =>
        stepComposerHistoryForContext(current, contextKey, 'newer'),
      );
    },
    [updateDraftState],
  );

  return {
    getDraft,
    hasDraft,
    setDraft,
    recordComposerEntry,
    recallOlderDraft,
    recallNewerDraft,
  };
};

const writeComposerContextState = (
  state: ComposerDraftState,
  contextKey: string,
  nextState: ComposerContextState,
): ComposerDraftState => {
  if (isEmptyComposerContextState(nextState)) {
    if (!(contextKey in state)) {
      return state;
    }
    const { [contextKey]: _removed, ...remaining } = state;
    return remaining;
  }
  return {
    ...state,
    [contextKey]: nextState,
  };
};

const isEmptyComposerContextState = (state: ComposerContextState) =>
  state.draft === '' &&
  state.history.entries.length === 0 &&
  state.history.index === null &&
  state.history.draftBeforeNavigation === '';
