import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';
import { resolveChatPaneHeaderActions } from '../web/src/chat-pane-header-actions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'Cuff-Link',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  altNicks: ['sofia_'],
  username: 'sofia',
  realName: 'Sofia',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

const makeBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? network.id,
  kind: overrides.kind ?? 'channel',
  target: overrides.target ?? '#help',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

const makeWorkspace = (overrides: Partial<WorkspaceView> = {}): WorkspaceView => ({
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: 'buffer-1' },
  workspaceNetworks: [network],
  selectedNetwork: network,
  selectedRuntime: {
    phase: 'connected',
    serverName: 'irc.example.test',
    nick: 'sofia',
  },
  selectedBuffer: makeBuffer(),
  selectedChannel: {
    id: 'buffer-1',
    networkId: network.id,
    name: '#help',
    topic: 'Help channel',
    users: [],
  },
  selectedPendingChannel: null,
  headerTitle: '#help',
  headerSubtitle: 'sofia @ irc.example.test',
  composerMode: 'normal',
  composerPlaceholder: 'Message #help',
  emptyBody: 'No history yet.',
  showNicklist: true,
  ...overrides,
});

const resolveActionLabels = (actions: ReturnType<typeof resolveChatPaneHeaderActions>) => ({
  primary: actions.primary.map((action) => action.label),
  overflow: actions.overflow.map((action) => action.label),
});

const createContext = (overrides: Partial<Parameters<typeof resolveChatPaneHeaderActions>[0]> = {}) => ({
  workspace: makeWorkspace(),
  showChannelAutoJoin: false,
  channelAutoJoinActive: false,
  canDownloadHistory: false,
  onWhoisSelectedQuery: () => undefined,
  onToggleChannelAutoJoin: async () => true,
  onDownloadHistory: async () => true,
  onCloseChannel: () => undefined,
  onCloseBuffer: () => undefined,
  onOpenChannelList: () => undefined,
  ...overrides,
});

test('channel header actions keep close primary and move maintenance actions into overflow', () => {
  const actions = resolveChatPaneHeaderActions(createContext({
    showChannelAutoJoin: true,
    channelAutoJoinActive: true,
    canDownloadHistory: true,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['Autojoin On', 'Download history'],
  });
});

test('query header actions keep close visible and leave utilities in overflow', () => {
  const queryBuffer = makeBuffer({
    kind: 'query',
    target: 'MissD',
  });
  const actions = resolveChatPaneHeaderActions(createContext({
    workspace: makeWorkspace({
      mode: 'query-connected',
      selectedBuffer: queryBuffer,
      selectedChannel: null,
      headerTitle: 'MissD',
      composerPlaceholder: 'Message MissD',
      showNicklist: false,
    }),
    canDownloadHistory: true,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['WHOIS', 'Download history'],
  });
});

test('query header actions are stable when notifications are enabled', () => {
  const queryBuffer = makeBuffer({
    kind: 'query',
    target: 'MissD',
  });
  const actions = resolveChatPaneHeaderActions(createContext({
    workspace: makeWorkspace({
      mode: 'query-connected',
      selectedBuffer: queryBuffer,
      selectedChannel: null,
      headerTitle: 'MissD',
      composerPlaceholder: 'Message MissD',
      showNicklist: false,
    }),
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['WHOIS'],
  });
});

test('query header actions stay stable while the query is still active', () => {
  const queryBuffer = makeBuffer({
    kind: 'query',
    target: 'MissD',
  });
  const actions = resolveChatPaneHeaderActions(createContext({
    workspace: makeWorkspace({
      mode: 'query-connected',
      selectedBuffer: queryBuffer,
      selectedChannel: null,
      headerTitle: 'MissD',
      composerPlaceholder: 'Message MissD',
      showNicklist: false,
    }),
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['WHOIS'],
  });
});

test('muted query header actions keep utilities available', () => {
  const queryBuffer = makeBuffer({
    kind: 'query',
    target: 'MissD',
  });
  const actions = resolveChatPaneHeaderActions(createContext({
    workspace: makeWorkspace({
      mode: 'query-connected',
      selectedBuffer: queryBuffer,
      selectedChannel: null,
      headerTitle: 'MissD',
      composerPlaceholder: 'Message MissD',
      showNicklist: false,
    }),
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['WHOIS'],
  });
});

test('server header actions keep list channels visible without overflow', () => {
  const serverBuffer = makeBuffer({
    kind: 'server',
    target: 'server',
  });
  const actions = resolveChatPaneHeaderActions(createContext({
    workspace: makeWorkspace({
      mode: 'server-connected',
      selectedBuffer: serverBuffer,
      selectedChannel: null,
      headerTitle: 'Cuff-Link',
      composerMode: 'commands',
      composerPlaceholder: 'Use /join #channel or another /command',
      showNicklist: false,
    }),
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['List Channels'],
    overflow: [],
  });
});
