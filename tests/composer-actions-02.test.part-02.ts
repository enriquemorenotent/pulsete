import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,ChannelState,NetworkProfile } from '../shared/protocol.js';
import { sendComposerMessage } from '../web/src/composer-actions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
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

const selectedBuffer: BufferState = {
  id: 'buffer-1',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const selectedChannel: ChannelState = {
  id: selectedBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: '',
  users: [],
};

const workspace: WorkspaceView = {
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: selectedBuffer.id },
  workspaceNetworks: [network],
  selectedNetwork: network,
  selectedRuntime: null,
  selectedBuffer,
  selectedChannel,
  selectedPendingChannel: null,
  headerTitle: '#general',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: 'Message #general',
  emptyBody: '',
  showNicklist: true,
};

test('/close rejects the server buffer', async () => {
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const serverBuffer: BufferState = {
    ...selectedBuffer,
    kind: 'server',
    target: 'server',
  };
  const serverWorkspace: WorkspaceView = {
    ...workspace,
    mode: 'server-connected',
    selectedBuffer: serverBuffer,
    selectedChannel: null,
    headerTitle: 'Server',
    composerMode: 'commands',
    composerPlaceholder: 'Send an IRC command',
    showNicklist: false,
  };

  await sendComposerMessage({
    draft: '/close',
    setDraft: () => {},
    socket: {
      send: () => {},
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace: serverWorkspace,
    onJoinChannel: async () => {},
    onOpenChannelList: async () => {},
    onOpenQuery: async () => {},
    onCloseChannel: () => {},
    onCloseBuffer: async () => {},
  });

  assert.deepEqual(banners, [{ kind: 'error', message: 'Only channels and private messages can be closed with /close' }]);
});

