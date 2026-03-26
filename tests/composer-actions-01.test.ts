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

test('/msg sends a private message without opening or selecting a query buffer', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/msg alice hello there',
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
  });

  assert.deepEqual(sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'alice',
      body: 'hello there',
      kind: 'message',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(listedNetworks, []);
  assert.deepEqual(openedQueries, []);
});

test('/j joins a channel through the channel opener', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/j #help',
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
  });

  assert.deepEqual(sent, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, [{ networkId: 'network-1', channel: '#help' }]);
  assert.deepEqual(listedNetworks, []);
  assert.deepEqual(openedQueries, []);
});

test('/query opens or selects a private-message buffer', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/query alice',
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
  });

  assert.deepEqual(sent, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(listedNetworks, []);
  assert.deepEqual(openedQueries, [{ networkId: 'network-1', nick: 'alice' }]);
});

test('/ns sends a NickServ message without opening a query buffer', async () => {
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const listedNetworks: string[] = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/ns help',
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
  });

  assert.deepEqual(sent, [
    {
      type: 'message.send',
      networkId: 'network-1',
      target: 'NickServ',
      body: 'help',
      kind: 'message',
      sourceBufferId: 'buffer-1',
    },
  ]);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(listedNetworks, []);
  assert.deepEqual(openedQueries, []);
});
