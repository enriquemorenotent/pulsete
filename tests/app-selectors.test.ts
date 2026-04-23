import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import {
  selectSidebarConnections,
  selectWorkspace,
} from '../web/src/app-selectors.js';
import { initialState } from '../web/src/app-state.js';
import type { State } from '../web/src/app-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6667,
  tls: false,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
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
