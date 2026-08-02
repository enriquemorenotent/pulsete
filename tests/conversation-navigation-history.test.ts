import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getConversationNavigationKeyDirection,
} from '../web/src/conversation-navigation-history.js';
import { createAppStore } from '../web/src/app-store.js';
import {
  emptySnapshot,
  makeBuffer,
  makeNetwork,
  makePendingChannel,
} from './helpers/app-state-test-helpers.js';
import {
  attachHistory,
  DeferredPopStateHistory,
  makeReadyState,
  selection,
} from './helpers/conversation-navigation-history-test-helpers.js';

test('back and forward revisit conversation tabs in selection order', () => {
  const buffers = [
    makeBuffer({ id: 'server' }),
    makeBuffer({ id: 'channel', kind: 'channel', target: '#help' }),
    makeBuffer({ id: 'query', kind: 'query', target: 'alice' }),
  ];
  const store = createAppStore(makeReadyState({
    buffers,
    selection: selection('server'),
  }));
  const navigation = attachHistory(store);

  store.dispatch({ type: 'select', selection: selection('channel') });
  store.dispatch({ type: 'select', selection: selection('query') });
  assert.equal(navigation.history.entries.length, 3);

  assert.equal(navigation.controller.navigate('back'), true);
  assert.deepEqual(store.getState().transient.selection, selection('channel'));
  assert.equal(navigation.controller.navigate('back'), true);
  assert.deepEqual(store.getState().transient.selection, selection('server'));
  assert.equal(navigation.controller.navigate('forward'), true);
  assert.deepEqual(store.getState().transient.selection, selection('channel'));

  navigation.dispose();
});

test('same-tab selections do not add entries and a new choice clears forward history', () => {
  const buffers = [
    makeBuffer({ id: 'server' }),
    makeBuffer({ id: 'channel', kind: 'channel', target: '#help' }),
    makeBuffer({ id: 'query', kind: 'query', target: 'alice' }),
  ];
  const store = createAppStore(makeReadyState({
    buffers,
    selection: selection('server'),
  }));
  const navigation = attachHistory(store);

  store.dispatch({ type: 'select', selection: selection('channel') });
  store.dispatch({ type: 'select', selection: selection('channel') });
  store.dispatch({ type: 'select', selection: selection('query') });
  assert.equal(navigation.history.entries.length, 3);

  navigation.history.back();
  store.dispatch({ type: 'select', selection: selection('server') });
  assert.equal(navigation.history.entries.length, 3);
  assert.equal(navigation.controller.navigate('forward'), false);
  assert.deepEqual(store.getState().transient.selection, selection('server'));

  navigation.dispose();
});

test('closing the selected conversation restores the previous tab without a fallback render', () => {
  const buffers = [
    makeBuffer({ id: 'server' }),
    makeBuffer({ id: 'john', kind: 'query', target: 'JOHN' }),
    makeBuffer({ id: 'jane', kind: 'query', target: 'JANE' }),
  ];
  const store = createAppStore(makeReadyState({
    buffers,
    selection: selection('server'),
  }));
  const history = new DeferredPopStateHistory();
  const navigation = attachHistory(store, history);

  store.dispatch({ type: 'select', selection: selection('john') });
  store.dispatch({ type: 'select', selection: selection('jane') });
  const observedBufferIds = ['jane'];
  const unsubscribe = store.subscribe(() => {
    const selected = store.getState().transient.selection;
    const bufferId = selected?.kind === 'buffer' ? selected.bufferId : null;
    if (observedBufferIds.at(-1) !== bufferId) {
      observedBufferIds.push(bufferId ?? 'none');
    }
  });
  store.dispatch({
    type: 'remove-buffer',
    bufferId: 'jane',
    networkId: buffers[2]!.networkId,
  });

  assert.deepEqual(store.getState().transient.selection, selection('john'));
  assert.deepEqual(observedBufferIds, ['jane', 'john']);
  assert.equal(history.flushPopState(), true);
  assert.deepEqual(store.getState().transient.selection, selection('john'));
  assert.deepEqual(observedBufferIds, ['jane', 'john']);
  unsubscribe();
  navigation.dispose();
});

test('a joining channel becoming ready replaces its pending history entry', () => {
  const server = makeBuffer({ id: 'server' });
  const pending = makePendingChannel({ channel: '#help' });
  const store = createAppStore(makeReadyState({
    buffers: [server],
    pendingChannels: [pending],
    selection: selection(server.id),
  }));
  const navigation = attachHistory(store);

  store.dispatch({
    type: 'select',
    selection: {
      kind: 'pending-channel',
      networkId: pending.networkId,
      channel: pending.channel,
    },
  });
  store.dispatch({
    type: 'upsert-buffer',
    buffer: makeBuffer({
      id: 'channel',
      kind: 'channel',
      target: pending.channel,
    }),
  });
  assert.equal(navigation.history.entries.length, 2);
  assert.deepEqual(store.getState().transient.selection, selection('channel'));

  navigation.history.back();
  assert.deepEqual(store.getState().transient.selection, selection(server.id));
  navigation.history.forward();
  assert.deepEqual(store.getState().transient.selection, selection('channel'));

  navigation.dispose();
});

test('stale historical tabs fall back to the server from the same network', () => {
  const firstNetwork = makeNetwork({
    id: 'network-1',
    workspaceOpen: true,
  });
  const secondNetwork = makeNetwork({
    id: 'network-2',
    name: 'OFTC',
    workspaceOpen: true,
  });
  const firstServer = makeBuffer({ id: 'server-1', networkId: firstNetwork.id });
  const secondServer = makeBuffer({ id: 'server-2', networkId: secondNetwork.id });
  const query = makeBuffer({
    id: 'query-2',
    kind: 'query',
    networkId: secondNetwork.id,
    target: 'alice',
  });
  const store = createAppStore(makeReadyState({
    networks: [firstNetwork, secondNetwork],
    buffers: [firstServer, secondServer, query],
    selection: selection(firstServer.id),
  }));
  const navigation = attachHistory(store);

  store.dispatch({ type: 'select', selection: selection(query.id) });
  navigation.history.back();
  store.dispatch({
    type: 'remove-buffer',
    bufferId: query.id,
    networkId: secondNetwork.id,
  });
  navigation.history.forward();

  assert.deepEqual(
    store.getState().transient.selection,
    selection(secondServer.id),
  );
  navigation.dispose();
});

test('current history state restores after reload without adding an entry', () => {
  const buffers = [
    makeBuffer({ id: 'server' }),
    makeBuffer({ id: 'channel', kind: 'channel', target: '#help' }),
  ];
  const firstStore = createAppStore(makeReadyState({
    buffers,
    selection: selection('server'),
  }));
  const firstNavigation = attachHistory(firstStore);
  firstStore.dispatch({ type: 'select', selection: selection('channel') });
  firstNavigation.dispose();

  const reloadedStore = createAppStore(makeReadyState({
    buffers,
    selection: selection('server'),
  }));
  const reloadedNavigation = attachHistory(
    reloadedStore,
    firstNavigation.history,
  );

  assert.deepEqual(
    reloadedStore.getState().transient.selection,
    selection('channel'),
  );
  assert.equal(reloadedNavigation.history.entries.length, 2);
  reloadedNavigation.dispose();
});

test('loading initialization replaces the first entry after the snapshot', () => {
  const network = makeNetwork({ workspaceOpen: true });
  const server = makeBuffer();
  const store = createAppStore();
  const navigation = attachHistory(store);

  store.dispatch({
    type: 'snapshot',
    snapshot: {
      ...emptySnapshot(),
      networks: [network],
      buffers: [server],
    },
  });

  assert.equal(navigation.history.entries.length, 1);
  assert.deepEqual(store.getState().transient.selection, selection(server.id));
  navigation.dispose();
});

test('navigation keyboard mappings use platform-standard shortcuts', () => {
  const base = {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    isComposing: false,
    key: '',
    metaKey: false,
    shiftKey: false,
  };
  assert.equal(getConversationNavigationKeyDirection({
    ...base,
    altKey: true,
    key: 'ArrowLeft',
  }, false), 'back');
  assert.equal(getConversationNavigationKeyDirection({
    ...base,
    altKey: true,
    key: 'ArrowRight',
  }, false), 'forward');
  assert.equal(getConversationNavigationKeyDirection({
    ...base,
    code: 'BracketLeft',
    key: '[',
    metaKey: true,
  }, true), 'back');
  assert.equal(getConversationNavigationKeyDirection({
    ...base,
    code: 'BracketRight',
    key: ']',
    metaKey: true,
  }, true), 'forward');
  assert.equal(getConversationNavigationKeyDirection({
    ...base,
    altKey: true,
    ctrlKey: true,
    key: 'ArrowLeft',
  }, false), null);
});
