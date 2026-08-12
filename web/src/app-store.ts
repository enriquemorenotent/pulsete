import {
  createElement,
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { initialState, reducer } from './app-state.js';
import type { Action, State } from './app-types.js';

type Listener = () => void;

export type AppStoreActionEvent = {
  action: Action;
  previousState: State;
  state: State;
};

type ActionListener = (event: AppStoreActionEvent) => void;

export type AppStoreApi = {
  batch: (callback: () => void) => void;
  dispatch: (action: Action) => void;
  getState: () => State;
  subscribe: (listener: Listener) => () => void;
  subscribeActions: (listener: ActionListener) => () => void;
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
  const actionListeners = new Set<ActionListener>();

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
      const previousState = currentState;
      const nextState = reducer(currentState, action);
      if (nextState === currentState) {
        return;
      }
      currentState = nextState;
      for (const listener of actionListeners) {
        listener({ action, previousState, state: nextState });
      }
      notify();
    },
    getState: () => currentState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeActions(listener) {
      actionListeners.add(listener);
      return () => {
        actionListeners.delete(listener);
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
