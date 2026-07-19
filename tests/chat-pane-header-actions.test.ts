import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
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
  canDownloadHistory: false,
  canDeleteHistory: false,
  canSearchHistory: false,
  onWhoisSelectedQuery: () => undefined,
  onDownloadHistory: async () => true,
  onDeleteHistory: () => undefined,
  onOpenHistorySearch: () => undefined,
  onCloseChannel: () => undefined,
  onCloseBuffer: () => undefined,
  onOpenChannelList: () => undefined,
  ...overrides,
});

test('channel header actions keep close primary and move maintenance actions into overflow', () => {
  const actions = resolveChatPaneHeaderActions(createContext({
    canDownloadHistory: true,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['Download history'],
  });
});

test('channel header actions expose history search when the selected buffer supports it', () => {
  const actions = resolveChatPaneHeaderActions(createContext({
    canSearchHistory: true,
    canDownloadHistory: true,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['Search history', 'Download history'],
  });
});

test('query header actions keep WHOIS and close visible while history stays in overflow', () => {
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
    primary: ['WHOIS', 'Close'],
    overflow: ['Download history'],
  });
});

test('query header actions expose destructive history delete when enabled', () => {
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
    canDeleteHistory: true,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['WHOIS', 'Close'],
    overflow: ['Delete history'],
  });
  assert.equal(actions.overflow.find((action) => action.label === 'Delete history')?.tone, 'danger');
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
    primary: ['WHOIS', 'Close'],
    overflow: [],
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
    primary: ['WHOIS', 'Close'],
    overflow: [],
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
    primary: ['WHOIS', 'Close'],
    overflow: [],
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
