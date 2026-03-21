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
  });

  assert.deepEqual(banners, [{ kind: 'error', message: 'Usage: /list' }]);
  assert.deepEqual(listedNetworks, []);
});
