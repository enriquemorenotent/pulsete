import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol-chat.js';
import {
  selectRightSidebarKind,
  selectSidebarConnections,
  selectWorkspace,
} from '../web/src/app-selectors.js';
import { initialState } from '../web/src/app-state.js';
import type { State } from '../web/src/app-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  realName: 'tester',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

const channelBuffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const channel: ChannelState = {
  id: channelBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: '',
  users: [],
};

const createState = (): State => ({
  ...initialState,
  domain: {
    ...initialState.domain,
    phase: 'ready',
    networks: [network],
    buffers: [channelBuffer],
    channels: [channel],
    networkStates: {
      [network.id]: { phase: 'connected', serverName: 'irc.example.test', nick: network.nick },
    },
  },
  transient: {
    ...initialState.transient,
    selection: { kind: 'buffer', bufferId: channelBuffer.id },
  },
});

test('workspace selector keeps the same reference across unrelated banner updates', () => {
  const state = createState();
  const initialWorkspace = selectWorkspace(state);
  const nextWorkspace = selectWorkspace({
    ...state,
    transient: {
      ...state.transient,
      banner: { kind: 'notice', message: 'Saved' },
    },
  });

  assert.equal(nextWorkspace, initialWorkspace);
});

test('sidebar selector keeps the same reference across unrelated UI-only changes', () => {
  const state = createState();
  const initialSidebar = selectSidebarConnections(state);
  const nextSidebar = selectSidebarConnections({
    ...state,
    transient: {
      ...state.transient,
      networkManager: {
        ...state.transient.networkManager,
        showFavoritesOnly: true,
      },
    },
  });

  assert.equal(nextSidebar, initialSidebar);
});

test('sidebar connections use favorite-first workspace network ordering', () => {
  const networks: NetworkProfile[] = [
    { ...network, id: 'zeta', name: 'Zeta', favorite: false },
    { ...network, id: 'closed', name: 'A Closed', workspaceOpen: false, favorite: true },
    { ...network, id: 'beta-favorite', name: 'beta', favorite: true },
    { ...network, id: 'alpha', name: 'Alpha', favorite: false },
    { ...network, id: 'alpha-favorite', name: 'alpha', favorite: true },
  ];
  const state: State = {
    ...initialState,
    domain: {
      ...initialState.domain,
      phase: 'ready',
      networks,
    },
  };

  assert.deepEqual(
    selectSidebarConnections(state).map((connection) => connection.network.id),
    ['alpha-favorite', 'beta-favorite', 'alpha', 'zeta'],
  );
});

test('right sidebar kind uses notes for selected query buffers', () => {
  const state = createState();
  const queryBuffer: BufferState = {
    ...channelBuffer,
    id: 'query-1',
    kind: 'query',
    target: 'Sofia',
    notes: 'Ask about the bridge watch',
  };
  const queryState: State = {
    ...state,
    domain: {
      ...state.domain,
      buffers: [
        { ...channelBuffer, id: 'server-1', kind: 'server', target: 'server' },
        queryBuffer,
      ],
      channels: [],
    },
    transient: {
      ...state.transient,
      selection: { kind: 'buffer', bufferId: queryBuffer.id },
    },
  };

  assert.equal(selectRightSidebarKind(queryState), 'notes');
});
