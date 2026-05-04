import assert from 'node:assert/strict';
import test from 'node:test';
import { initialChannelListState,initialState,reducer } from '../web/src/app-state.js';
import { emptyNetworkForm } from '../web/src/network-form.js';
import { resolveManagedNetworkId } from '../web/src/network-manager-state.js';
import { makeBuffer, makeNetwork, makePendingChannel, makeState } from './helpers/app-state-test-helpers.js';

test('removing a pending channel falls back to the same network server buffer', () => {
  const serverBuffer = makeBuffer({ id: 'server-1', kind: 'server' });
  const state = makeState({
    domain: {
      networks: [makeNetwork({ id: 'network-1', workspaceOpen: true })],
      buffers: [serverBuffer],
      pendingChannels: [makePendingChannel({ networkId: 'network-1', channel: '#help' })],
    },
    transient: {
      selection: { kind: 'pending-channel', networkId: 'network-1', channel: '#help' },
    },
  });

  const nextState = reducer(state, {
    type: 'remove-pending-channel',
    networkId: 'network-1',
    channel: '#help',
  });

  assert.deepEqual(nextState.transient.selection, { kind: 'buffer', bufferId: serverBuffer.id });
});

test('channel list resets when the gateway drops, its network disconnects, or the network is removed', () => {
  const connectedState = makeState({
    domain: {
      phase: 'ready',
      networks: [makeNetwork({ id: 'network-1', workspaceOpen: true })],
      buffers: [makeBuffer({ networkId: 'network-1' })],
    },
    transient: {
      historyLoadedByBufferId: { 'buffer-1': true },
      historyHasOlderByBufferId: { 'buffer-1': true },
      channelList: {
        open: true,
        networkId: 'network-1',
        requestId: 'request-1',
        status: 'loading',
        entries: [{ name: '#help', users: 42, topic: 'Support' }],
        totalEntries: 1,
        truncated: false,
        error: null,
      },
    },
  });

  const gatewayDisconnected = reducer(connectedState, { type: 'gateway-disconnected' });
  const disconnected = reducer(connectedState, {
    type: 'network-state',
    networkId: 'network-1',
    phase: 'offline',
    serverName: null,
    nick: 'tester',
    capabilities: { offered: [], negotiated: [], pending: [] },
  });
  const removed = reducer(connectedState, { type: 'remove-network', networkId: 'network-1' });

  assert.deepEqual(gatewayDisconnected.transient.channelList, initialChannelListState);
  assert.deepEqual(disconnected.transient.channelList, initialChannelListState);
  assert.deepEqual(removed.transient.channelList, initialChannelListState);
  assert.deepEqual(gatewayDisconnected.transient.historyLoadedByBufferId, {});
  assert.deepEqual(gatewayDisconnected.transient.historyHasOlderByBufferId, {});
  assert.deepEqual(removed.transient.historyLoadedByBufferId, {});
  assert.deepEqual(removed.transient.historyHasOlderByBufferId, {});
});

test('removing a network prunes its muted nicks and query presence', () => {
  const removedQuery = makeBuffer({
    id: 'query-1',
    networkId: 'network-1',
    kind: 'query',
    target: 'Alice',
  });
  const retainedQuery = makeBuffer({
    id: 'query-2',
    networkId: 'network-2',
    kind: 'query',
    target: 'Bob',
  });
  const state = makeState({
    domain: {
      networks: [
        makeNetwork({ id: 'network-1', workspaceOpen: true }),
        makeNetwork({ id: 'network-2', workspaceOpen: true }),
      ],
      buffers: [removedQuery, retainedQuery],
      mutedNicks: [
        { id: 'mute-1', networkId: 'network-1', nick: 'Alice' },
        { id: 'mute-2', networkId: 'network-2', nick: 'Bob' },
      ],
      queryPresence: {
        [removedQuery.id]: 'online',
        [retainedQuery.id]: 'away',
      },
    },
  });

  const nextState = reducer(state, { type: 'remove-network', networkId: 'network-1' });

  assert.deepEqual(nextState.domain.mutedNicks.map((mutedNick) => mutedNick.id), ['mute-2']);
  assert.equal(removedQuery.id in nextState.domain.queryPresence, false);
  assert.equal(nextState.domain.queryPresence[retainedQuery.id], 'away');
});

test('presence updates match channel names case-insensitively', () => {
  const channel = {
    id: 'channel-1',
    networkId: 'network-1',
    name: '#Help',
    topic: '',
    users: [],
  };

  const nextState = reducer(
    makeState({
      domain: {
        channels: [channel],
      },
    }),
    {
      type: 'update-presence',
      networkId: 'network-1',
      channel: '#help',
      users: [{ nick: 'Alice', mode: 'voice', away: false }],
    }
  );

  assert.deepEqual(nextState.domain.channels[0]?.users, [{ nick: 'Alice', mode: 'voice', away: false }]);
});

test('resolveManagedNetworkId keeps a hidden selection while favorites are filtered', () => {
  const nonFavorite = makeNetwork({ id: 'network-1', name: 'IRCnet', favorite: false });
  const favorite = makeNetwork({ id: 'network-2', name: 'Libera.Chat', favorite: true });

  const managedNetworkId = resolveManagedNetworkId({
    phase: 'ready',
    managerNetworks: [nonFavorite, favorite],
    visibleNetworks: [favorite],
    managedNetworkId: nonFavorite.id,
  });

  assert.equal(managedNetworkId, nonFavorite.id);
});

test('network manager transitions between manager and editor modes inside reducer state', () => {
  const opened = reducer(initialState, { type: 'open-network-manager' });
  const editing = reducer(opened, {
    type: 'open-network-editor',
    managedNetworkId: 'network-1',
    editor: {
      kind: 'existing',
      tab: 'servers',
      form: { ...emptyNetworkForm(), id: 'network-1', name: 'Libera.Chat' },
      returnMode: 'manager',
    },
  });
  const updated = reducer(editing, { type: 'update-network-editor-form', form: { host: 'irc.libera.chat' } });
  const closed = reducer(updated, { type: 'close-network-editor' });

  assert.equal(opened.transient.networkManager.mode, 'manager');
  assert.equal(editing.transient.networkManager.mode, 'editor');
  assert.equal(editing.transient.networkManager.managedNetworkId, 'network-1');
  assert.equal(updated.transient.networkManager.editor?.form.host, 'irc.libera.chat');
  assert.equal(closed.transient.networkManager.mode, 'manager');
  assert.equal(closed.transient.networkManager.editor, null);
});

test('closing the network manager clears editor state but preserves favorites filter', () => {
  const state = makeState({
    transient: {
      networkManager: {
        mode: 'editor',
        managedNetworkId: 'network-1',
        showFavoritesOnly: true,
        editor: {
          kind: 'new',
          tab: 'autojoin',
          form: emptyNetworkForm(),
          returnMode: 'manager',
        },
      },
    },
  });

  const nextState = reducer(state, { type: 'close-network-manager' });

  assert.deepEqual(nextState.transient.networkManager, {
    mode: 'closed',
    managedNetworkId: 'network-1',
    showFavoritesOnly: true,
    editor: null,
  });
});
