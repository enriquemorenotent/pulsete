import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
import { resolveChatPaneHeaderActions } from '../web/src/chat-pane-header-actions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  altNicks: [],
  autoJoin: [],
  favorite: false,
  hasPassword: false,
  host: 'irc.example.test',
  id: 'network-1',
  name: 'ExampleNet',
  nick: 'mira',
  port: 6697,
  realName: 'Mira',
  tls: true,
  workspaceOpen: true,
};

test('chat header exposes assistant action when enabled for a channel', () => {
  const actions = resolveChatPaneHeaderActions({
    ...createContext(),
    canUseAssistant: true,
  });

  assert.deepEqual(actions.overflow.map((action) => action.label), ['Assistant']);
});

test('chat header omits assistant action when no handler is available', () => {
  const actions = resolveChatPaneHeaderActions({
    ...createContext(),
    canUseAssistant: true,
    onOpenAssistant: undefined,
  });

  assert.deepEqual(actions.overflow.map((action) => action.label), []);
});

const createContext = (): Parameters<typeof resolveChatPaneHeaderActions>[0] => ({
  canDeleteHistory: false,
  canDownloadHistory: false,
  canSearchHistory: false,
  channelAutoJoinActive: false,
  onCloseBuffer: () => undefined,
  onCloseChannel: () => undefined,
  onOpenAssistant: () => undefined,
  onOpenChannelList: () => undefined,
  onToggleChannelAutoJoin: async () => true,
  showChannelAutoJoin: false,
  workspace: createWorkspace(),
});

const createWorkspace = (): WorkspaceView => {
  const buffer = createBuffer();
  return {
    composerMode: 'normal',
    composerPlaceholder: 'Message #lobby',
    emptyBody: 'No history yet.',
    headerSubtitle: 'mira @ irc.example.test',
    headerTitle: '#lobby',
    mode: 'channel-connected',
    selectedBuffer: buffer,
    selectedChannel: {
      id: buffer.id,
      name: buffer.target,
      networkId: buffer.networkId,
      topic: '',
      users: [],
    },
    selectedNetwork: network,
    selectedPendingChannel: null,
    selectedRuntime: { nick: network.nick, phase: 'connected', serverName: network.host },
    selection: { bufferId: buffer.id, kind: 'buffer' },
    showNicklist: true,
    workspaceNetworks: [network],
  };
};

const createBuffer = (): BufferState => ({
  id: 'buffer-1',
  kind: 'channel',
  lastReadMessageId: null,
  lastReadTs: null,
  networkId: network.id,
  priorityUnread: 0,
  target: '#lobby',
  unread: 0,
});
