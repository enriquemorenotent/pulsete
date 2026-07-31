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
import type { BufferDraft } from '../../shared/protocol-preferences.js';

type Listener = () => void;

export type ComposerStoreApi = ComposerController & {
  getState: () => ComposerDraftState;
  subscribe: (listener: Listener) => () => void;
  subscribeDrafts: (listener: (bufferId: string, body: string) => void) => () => void;
  applyServerDrafts: (drafts: readonly BufferDraft[]) => void;
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
  const draftListeners = new Set<(bufferId: string, body: string) => void>();
  let serverDraftBufferIds = new Set<string>();
  const dirtyDrafts = new Map<string, string>();

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
    applyServerDrafts: (drafts) => {
      const incoming = new Map(drafts.map((draft) => [draft.bufferId, draft.body]));
      const nextServerDraftBufferIds = new Set(incoming.keys());
      update((current) => {
        let next = current;
        for (const bufferId of new Set([...serverDraftBufferIds, ...nextServerDraftBufferIds])) {
          const body = incoming.get(bufferId) ?? '';
          const dirty = dirtyDrafts.get(bufferId);
          if (dirty !== undefined) {
            if (dirty === body) {
              dirtyDrafts.delete(bufferId);
            }
            next = setComposerDraftForContext(next, bufferId, dirty);
            continue;
          }
          next = setComposerDraftForContext(next, bufferId, body);
        }
        return next;
      });
      serverDraftBufferIds = nextServerDraftBufferIds;
    },
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
      if (contextKey) {
        dirtyDrafts.set(contextKey, value);
        for (const listener of draftListeners) {
          listener(contextKey, value);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeDrafts(listener) {
      draftListeners.add(listener);
      return () => {
        draftListeners.delete(listener);
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
