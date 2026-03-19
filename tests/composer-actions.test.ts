import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChannelState, ClientMessage, NetworkProfile } from '../shared/protocol.js';
import { sendComposerMessage } from '../web/src/composer-actions.js';
import type { Action } from '../web/src/app-types.js';
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
  selection: { bufferId: selectedBuffer.id },
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: null,
  selectedBuffer,
  selectedChannel,
  headerTitle: '#general',
  headerSubtitle: '',
  statusLabel: 'Connected',
  composerMode: 'normal',
  composerPlaceholder: 'Message #general',
  emptyBody: '',
  showNicklist: true,
};

test('/msg sends a private message without opening or selecting a query buffer', async () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/msg alice hello there',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onOpenChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
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
    },
  ]);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(openedQueries, []);
});

test('/j joins a channel through the channel opener', async () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/j #help',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onOpenChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
    },
    onOpenQuery: async (networkId, nick) => {
      openedQueries.push({ networkId, nick });
    },
  });

  assert.deepEqual(sent, []);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, [{ networkId: 'network-1', channel: '#help' }]);
  assert.deepEqual(openedQueries, []);
});

test('/query opens or selects a private-message buffer', async () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/query alice',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onOpenChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
    },
    onOpenQuery: async (networkId, nick) => {
      openedQueries.push({ networkId, nick });
    },
  });

  assert.deepEqual(sent, []);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(openedQueries, [{ networkId: 'network-1', nick: 'alice' }]);
});

test('/ns sends a NickServ message without opening a query buffer', async () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/ns help',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onOpenChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
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
    },
  ]);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(openedQueries, []);
});

test('/w sends a WHOIS raw command', async () => {
  const actions: Action[] = [];
  const sent: ClientMessage[] = [];
  const drafts: string[] = [];
  const banners: Array<{ kind: 'notice' | 'error'; message: string }> = [];
  const openedChannels: Array<{ networkId: string; channel: string }> = [];
  const openedQueries: Array<{ networkId: string; nick: string }> = [];

  await sendComposerMessage({
    draft: '/w alice',
    dispatch: (action) => actions.push(action),
    setDraft: (value) => drafts.push(value),
    socket: {
      send: (message) => sent.push(message),
      close: () => {},
    },
    updateBanner: (kind, message) => banners.push({ kind, message }),
    workspace,
    onOpenChannel: async (networkId, channel) => {
      openedChannels.push({ networkId, channel });
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
    },
  ]);
  assert.deepEqual(actions, []);
  assert.deepEqual(drafts, ['']);
  assert.deepEqual(banners, []);
  assert.deepEqual(openedChannels, []);
  assert.deepEqual(openedQueries, []);
});
