import { useEffect } from 'react';
import {
  useAppStore,
  type AppStoreActionEvent,
  type AppStoreApi,
} from './app-store.js';
import type { State } from './app-types.js';
import {
  normalizeHistorySelection,
  readConversationHistoryEntry,
  sameSelection,
  targetFromState,
  withConversationHistoryEntry,
  HISTORY_STATE_VERSION,
  type ConversationHistoryEntry,
  type HistoryTarget,
} from './conversation-navigation-history-state.js';

type NavigationHistory = Pick<
  History,
  'back' | 'forward' | 'pushState' | 'replaceState' | 'state'
>;

type NavigationStore = Pick<AppStoreApi, 'dispatch' | 'getState'>;

type NavigationKeyEvent = {
  altKey: boolean;
  code?: string;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export type ConversationNavigationDirection = 'back' | 'forward';

export const getConversationNavigationKeyDirection = (
  event: NavigationKeyEvent,
  isMac: boolean,
): ConversationNavigationDirection | null => {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.shiftKey) {
    return null;
  }
  if (
    !isMac
    && event.altKey
    && !event.metaKey
    && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    return event.key === 'ArrowLeft' ? 'back' : 'forward';
  }
  if (
    isMac
    && event.metaKey
    && !event.altKey
    && (
      event.key === '['
      || event.key === ']'
      || event.code === 'BracketLeft'
      || event.code === 'BracketRight'
    )
  ) {
    return event.key === '[' || event.code === 'BracketLeft' ? 'back' : 'forward';
  }
  return null;
};

export const createConversationNavigationHistory = (input: {
  history: NavigationHistory;
  schedule?: (callback: () => void) => void;
  store: NavigationStore;
}) => {
  const schedule = input.schedule ?? queueMicrotask;
  let currentIndex = 0;
  let highestIndex = 0;
  let initialized = false;
  let replaying = false;
  let restoreGeneration = 0;
  let disposed = false;

  const writeCurrentSelection = (
    mode: 'push' | 'replace',
    backTargetOverride?: HistoryTarget | null,
  ) => {
    const state = input.store.getState();
    const currentEntry = readConversationHistoryEntry(input.history.state);
    const entry: ConversationHistoryEntry = {
      backTarget: backTargetOverride !== undefined
        ? backTargetOverride
        : mode === 'push'
          ? currentEntry?.target ?? null
          : currentEntry?.backTarget ?? null,
      index: currentIndex,
      target: targetFromState(state),
      version: HISTORY_STATE_VERSION,
    };
    const nextHistoryState = withConversationHistoryEntry(input.history.state, entry);
    try {
      if (mode === 'push') {
        input.history.pushState(nextHistoryState, '');
      } else {
        input.history.replaceState(nextHistoryState, '');
      }
    } catch {
      // Keep tab selection working if the browser rejects a history write.
    }
  };

  const restore = (
    target: HistoryTarget,
    options: {
      backTarget?: HistoryTarget | null;
      writeHistory?: boolean;
    } = {},
  ) => {
    const state = input.store.getState();
    if (state.domain.phase !== 'ready') {
      return;
    }
    const selection = normalizeHistorySelection(state, target);
    if (!sameSelection(selection, state.transient.selection)) {
      replaying = true;
      try {
        input.store.dispatch({ type: 'select', selection });
      } finally {
        replaying = false;
      }
    }
    if (options.writeHistory !== false) {
      writeCurrentSelection('replace', options.backTarget);
    }
  };

  const initialize = (state: State) => {
    if (initialized || state.domain.phase !== 'ready') {
      return;
    }
    initialized = true;
    const entry = readConversationHistoryEntry(input.history.state);
    if (!entry) {
      currentIndex = 0;
      highestIndex = 0;
      writeCurrentSelection('replace');
      return;
    }
    currentIndex = entry.index;
    highestIndex = entry.index;
    const selection = normalizeHistorySelection(state, entry.target);
    if (sameSelection(selection, state.transient.selection)) {
      writeCurrentSelection('replace');
      return;
    }
    const generation = ++restoreGeneration;
    schedule(() => {
      if (!disposed && generation === restoreGeneration) {
        restore(entry.target);
      }
    });
  };

  const handleStoreAction = (event: AppStoreActionEvent) => {
    if (!initialized) {
      initialize(event.state);
      return;
    }
    const previousSelection = event.previousState.transient.selection;
    if (
      event.action.type === 'remove-buffer'
      && !event.action.replacementBufferId
      && previousSelection?.kind === 'buffer'
      && previousSelection.bufferId === event.action.bufferId
      && currentIndex > 0
    ) {
      restoreGeneration += 1;
      const currentEntry = readConversationHistoryEntry(input.history.state);
      if (currentEntry?.backTarget) {
        restore(currentEntry.backTarget, { writeHistory: false });
      }
      input.history.back();
      return;
    }
    if (
      event.state.domain.phase !== 'ready'
      || sameSelection(
        previousSelection,
        event.state.transient.selection,
      )
    ) {
      return;
    }
    if (event.action.type === 'select') {
      if (replaying) {
        return;
      }
      restoreGeneration += 1;
      currentIndex += 1;
      highestIndex = currentIndex;
      writeCurrentSelection('push', targetFromState(event.previousState));
      return;
    }
    writeCurrentSelection('replace');
  };

  const handlePopState = (historyState: unknown) => {
    const entry = readConversationHistoryEntry(historyState);
    if (!entry) {
      return;
    }
    restoreGeneration += 1;
    const departingIndex = currentIndex;
    const departingTarget = targetFromState(input.store.getState());
    currentIndex = entry.index;
    highestIndex = Math.max(highestIndex, currentIndex);
    restore(entry.target, {
      backTarget: entry.index === departingIndex + 1
        ? departingTarget
        : entry.backTarget,
    });
  };

  return {
    dispose() {
      disposed = true;
      restoreGeneration += 1;
    },
    handlePopState,
    handleStoreAction,
    initialize,
    navigate(direction: ConversationNavigationDirection) {
      if (
        !initialized
        || (direction === 'back' && currentIndex === 0)
        || (direction === 'forward' && currentIndex >= highestIndex)
      ) {
        return false;
      }
      input.history[direction]();
      return true;
    },
  };
};

export function useConversationNavigationHistory() {
  const store = useAppStore();

  useEffect(() => {
    const controller = createConversationNavigationHistory({
      history: window.history,
      store,
    });
    const isMac = /Mac|iPhone|iPad|iPod/.test(
      window.navigator.platform || window.navigator.userAgent,
    );
    const handlePopState = (event: PopStateEvent) => {
      controller.handlePopState(event.state);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const direction = getConversationNavigationKeyDirection(event, isMac);
      if (!direction) {
        return;
      }
      event.preventDefault();
      controller.navigate(direction);
    };
    const unsubscribe = store.subscribeActions(controller.handleStoreAction);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown, true);
    controller.initialize(store.getState());

    return () => {
      controller.dispose();
      unsubscribe();
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [store]);
}
