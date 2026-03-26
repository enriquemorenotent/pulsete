import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, FriendState, NetworkProfile } from '../shared/protocol.js';
import { resolveChatPaneHeaderActions } from '../web/src/chat-pane-header-actions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
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
  connectionInstances: [network],
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
  selectedFriend: null as FriendState | null,
  showChannelAutoJoin: false,
  channelAutoJoinActive: false,
  canClearHistory: false,
  canDownloadHistory: false,
  canImportHistory: false,
  onAddFriend: async () => true,
  onRemoveFriend: async () => true,
  onToggleChannelAutoJoin: async () => true,
  onClearHistory: async () => true,
  onDownloadHistory: async () => true,
  onOpenHistoryImport: () => undefined,
  onOpenSelfNickAliases: undefined,
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
    canImportHistory: true,
    canClearHistory: true,
    onOpenSelfNickAliases: () => undefined,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['Autojoin On', 'Download history', 'Import logs', 'Self aliases', 'Clear history'],
  });
});

test('query header actions move friend controls into overflow', () => {
  const selectedFriend: FriendState = {
    id: 'friend-1',
    nick: 'MissD',
  };
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
    selectedFriend,
    canDownloadHistory: true,
    onOpenSelfNickAliases: () => undefined,
  }));

  assert.deepEqual(resolveActionLabels(actions), {
    primary: ['Close'],
    overflow: ['Remove friend', 'Download history', 'Self aliases'],
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
