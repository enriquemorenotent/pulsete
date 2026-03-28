import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState,ChannelState,ClientMessage,NetworkProfile } from '../shared/protocol.js';
import { sendComposerMessage } from '../web/src/composer-actions.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

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
  connectionInstances: [network],
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

test('/w sends a WHOIS raw command', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/w alice',
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onJoinChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
    },
    onOpenChannelList: async (networkId) => {
      listedNetworks.push(networkId);
    },
    onOpenQuery: async (networkId, nick) => {
      openedQueries.push({ networkId, nick });
    },
    onCloseChannel: () => {},
    onCloseBuffer: async () => {},
  });

  assert.deepEqual(sent, [
    {
      type: 'raw.send',
      networkId: 'network-1',
      raw: 'WHOIS alice',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(listedNetworks, []);
  assert.deepEqual(openedQueries, []);
});

test('/list opens the channel list dialog without sending a raw IRC command', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/list',
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onJoinChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
    },
    onOpenChannelList: async (networkId) => {
      listedNetworks.push(networkId);
    },
    onOpenQuery: async (networkId, nick) => {
      openedQueries.push({ networkId, nick });
    },
    onCloseChannel: () => {},
    onCloseBuffer: async () => {},
  });

  assert.deepEqual(sent, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(listedNetworks, ['network-1']);
  assert.deepEqual(openedQueries, []);
});

test('/list rejects extra arguments', async () => {
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const listedNetworks: string[] = [];

  await sendComposerMessage({
    draft: '/list #help',
    setDraft: () => {},
    socket: {
      send: () => {},
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onJoinChannel: async () => {},
    onOpenChannelList: async (networkId) => {
      listedNetworks.push(networkId);
    },
    onOpenQuery: async () => {},
    onCloseChannel: () => {},
    onCloseBuffer: async () => {},
  });

  assert.deepEqual(banners, [{ kind: 'error', message: 'Usage: /list' }]);
  assert.deepEqual(listedNetworks, []);
});

test('/close closes the current channel through the close action', async () => {
  const closedChannels: Array<{ networkId: string; channel: string }> = [];

  await sendComposerMessage({
    draft: '/close',
    setDraft: () => {},
    socket: {
      send: () => {},
      close: () => {},
    },
    updateBanner: () => {},
    workspace,
    onJoinChannel: async () => {},
    onOpenChannelList: async () => {},
    onOpenQuery: async () => {},
    onCloseChannel: (networkId, channel) => {
      closedChannels.push({ networkId, channel });
    },
    onCloseBuffer: async () => {},
  });

  assert.deepEqual(closedChannels, [{ networkId: 'network-1', channel: '#general' }]);
});

test('/close closes the current query buffer through the close action', async () => {
  const closedBuffers: string[] = [];
  const queryBuffer: BufferState = {
    ...selectedBuffer,
    kind: 'query',
    target: 'alice',
  };
  const queryWorkspace: WorkspaceView = {
    ...workspace,
    mode: 'query-connected',
    selectedBuffer: queryBuffer,
    selectedChannel: null,
    headerTitle: 'alice',
    composerPlaceholder: 'Message alice',
    showNicklist: false,
  };

  await sendComposerMessage({
    draft: '/close',
    setDraft: () => {},
    socket: {
      send: () => {},
      close: () => {},
    },
    updateBanner: () => {},
    workspace: queryWorkspace,
    onJoinChannel: async () => {},
    onOpenChannelList: async () => {},
    onOpenQuery: async () => {},
    onCloseChannel: () => {},
    onCloseBuffer: async (buffer) => {
      closedBuffers.push(buffer.id);
    },
  });

  assert.deepEqual(closedBuffers, ['buffer-1']);
});

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
