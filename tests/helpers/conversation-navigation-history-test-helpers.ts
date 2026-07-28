import {
  createConversationNavigationHistory,
} from '../../web/src/conversation-navigation-history.js';
import type { AppStoreApi } from '../../web/src/app-store.js';
import type { State } from '../../web/src/app-types.js';
import type { SelectedBuffer } from '../../web/src/workspace-types.js';
import { makeBuffer, makeNetwork, makeState } from './app-state-test-helpers.js';

export class FakeHistory {
  entries: unknown[] = [null];
  index = 0;
  onPopState: ((state: unknown) => void) | null = null;

  get state() {
    return this.entries[this.index] ?? null;
  }

  back() {
    if (this.index === 0) {
      return;
    }
    this.index -= 1;
    this.onPopState?.(this.state);
  }

  forward() {
    if (this.index >= this.entries.length - 1) {
      return;
    }
    this.index += 1;
    this.onPopState?.(this.state);
  }

  pushState(data: unknown, _unused: string) {
    this.entries.splice(this.index + 1, Infinity, data);
    this.index += 1;
  }

  replaceState(data: unknown, _unused: string) {
    this.entries[this.index] = data;
  }
}

export const selection = (bufferId: string): SelectedBuffer => ({
  kind: 'buffer',
  bufferId,
});

export const makeReadyState = (overrides: {
  buffers?: State['domain']['buffers'];
  networks?: State['domain']['networks'];
  pendingChannels?: State['domain']['pendingChannels'];
  selection?: SelectedBuffer | null;
} = {}) => {
  const network = makeNetwork({ workspaceOpen: true });
  const server = makeBuffer();
  return makeState({
    domain: {
      phase: 'ready',
      networks: overrides.networks ?? [network],
      buffers: overrides.buffers ?? [server],
      pendingChannels: overrides.pendingChannels ?? [],
    },
    transient: {
      selection: overrides.selection === undefined
        ? selection(server.id)
        : overrides.selection,
    },
  });
};

export const attachHistory = (
  store: AppStoreApi,
  history = new FakeHistory(),
) => {
  const controller = createConversationNavigationHistory({
    history,
    schedule: (callback) => callback(),
    store,
  });
  const unsubscribe = store.subscribeActions(controller.handleStoreAction);
  history.onPopState = controller.handlePopState;
  controller.initialize(store.getState());
  return {
    controller,
    history,
    dispose() {
      unsubscribe();
      controller.dispose();
    },
  };
};
