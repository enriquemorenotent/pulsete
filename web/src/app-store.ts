import {
  createElement,
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { initialState, reducer } from './app-state.js';
import type { Action, State } from './app-types.js';
import { recordDiagnosticAction } from './memory-instrumentation.js';

type Listener = () => void;

export type AppStoreApi = {
  batch: (callback: () => void) => void;
  dispatch: (action: Action) => void;
  getState: () => State;
  subscribe: (listener: Listener) => () => void;
};

const notifyListeners = (listeners: Set<Listener>) => {
  for (const listener of listeners) {
    listener();
  }
};

export const createAppStore = (state: State = initialState): AppStoreApi => {
  let currentState = state;
  let batchDepth = 0;
  let pendingNotification = false;
  const listeners = new Set<Listener>();

  const flush = () => {
    if (!pendingNotification) {
      return;
    }
    pendingNotification = false;
    notifyListeners(listeners);
  };

  const notify = () => {
    if (batchDepth > 0) {
      pendingNotification = true;
      return;
    }
    notifyListeners(listeners);
  };

  return {
    batch(callback) {
      batchDepth += 1;
      try {
        callback();
      } finally {
        batchDepth -= 1;
        if (batchDepth === 0) {
          flush();
        }
      }
    },
    dispatch(action) {
      const nextState = reducer(currentState, action);
      recordDiagnosticAction(action.type, nextState !== currentState);
      if (nextState === currentState) {
        return;
      }
      currentState = nextState;
      notify();
    },
    getState: () => currentState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const AppStoreContext = createContext<AppStoreApi | null>(null);

export const AppStoreProvider = ({
  children,
  store,
}: {
  children: ReactNode;
  store: AppStoreApi;
}) =>
  createElement(AppStoreContext.Provider, { value: store }, children);

export const useAppStore = () => {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('AppStoreProvider is missing');
  }
  return store;
};

export const useAppDispatch = () => useAppStore().dispatch;

export const useAppSelector = <Selected,>(
  selector: (state: State) => Selected,
) => {
  const store = useAppStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
};
