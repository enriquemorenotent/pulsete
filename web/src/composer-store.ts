import { useSyncExternalStore } from 'react';
import {
  hasStoredComposerDraft,
  initialComposerDraftState,
  type ComposerController,
  type ComposerDraftState,
  pruneComposerDraftContexts,
  pushComposerHistoryEntryForContext,
  readComposerDraft,
  setComposerDraftForContext,
  stepComposerHistoryForContext,
} from './composer-history.js';

type Listener = () => void;

export type ComposerStoreApi = ComposerController & {
  getState: () => ComposerDraftState;
  subscribe: (listener: Listener) => () => void;
};

const notifyListeners = (listeners: Set<Listener>) => {
  for (const listener of listeners) {
    listener();
  }
};

export const createComposerStore = (
  initialState: ComposerDraftState = initialComposerDraftState,
): ComposerStoreApi => {
  let state = initialState;
  const listeners = new Set<Listener>();

  const update = (
    updater: (current: ComposerDraftState) => ComposerDraftState,
  ) => {
    const nextState = updater(state);
    if (nextState === state) {
      return;
    }
    state = nextState;
    notifyListeners(listeners);
  };

  return {
    getDraft: (contextKey) => readComposerDraft(state, contextKey),
    getState: () => state,
    hasDraft: (contextKey) => hasStoredComposerDraft(state, contextKey),
    pruneContexts: (contextKeys) => {
      update((current) => pruneComposerDraftContexts(current, contextKeys));
    },
    recordComposerEntry: (contextKey, entry) => {
      update((current) => pushComposerHistoryEntryForContext(current, contextKey, entry));
    },
    recallNewerDraft: (contextKey) => {
      update((current) => stepComposerHistoryForContext(current, contextKey, 'newer'));
    },
    recallOlderDraft: (contextKey) => {
      update((current) => stepComposerHistoryForContext(current, contextKey, 'older'));
    },
    setDraft: (contextKey, value) => {
      update((current) => setComposerDraftForContext(current, contextKey, value));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const useComposerDraft = (
  composer: ComposerStoreApi,
  contextKey: string | null,
) =>
  useSyncExternalStore(
    composer.subscribe,
    () => composer.getDraft(contextKey),
    () => composer.getDraft(contextKey),
  );
