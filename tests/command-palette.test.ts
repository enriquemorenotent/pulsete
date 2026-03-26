import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, FriendState, NetworkProfile, PendingChannelState } from '../shared/protocol.js';
import type { SidebarConnectionView } from '../web/src/connection-sidebar-view.js';
import {
  buildCommandPaletteEntrySpecs,
  filterCommandPaletteEntries,
  moveCommandPaletteActiveIndex,
  runCommandPaletteAction,
  shouldOpenCommandPaletteFromKeydown,
} from '../web/src/command-palette.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
  name: 'Cuff-Link',
  host: 'irc.cuff-link.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  altNicks: ['sofia_', 'sofia__'],
  username: 'sofia',
  realName: 'Sofia',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

const serverBuffer: BufferState = {
  id: 'buffer-server',
  networkId: network.id,
  kind: 'server',
  target: 'server',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: network.id,
  kind: 'channel',
  target: '#help',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: network.id,
  kind: 'query',
  target: 'Nathe',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const pendingChannel: PendingChannelState = {
  networkId: network.id,
  channel: '#pending',
};

const connection: SidebarConnectionView = {
  network,
  runtime: {
    phase: 'connected',
    serverName: 'irc.cuff-link.test',
    nick: network.nick,
  },
  serverBuffer,
  childBuffers: [
    { buffer: channelBuffer, selected: false },
    { buffer: queryBuffer, selected: false },
  ],
  pendingChannels: [
    { pendingChannel, selected: false },
  ],
  childBuffersDimmed: false,
  selectedServer: false,
  label: 'Cuff-Link (sofia)',
  labelParts: {
    name: 'Cuff-Link',
    nick: 'sofia',
    instanceIndex: null,
  },
};

const friend: FriendState = {
  id: 'friend-1',
  nick: 'Joby',
};

const otherNetwork: NetworkProfile = {
  ...network,
  id: 'network-2',
  name: 'OtherNet',
  host: 'irc.othernet.test',
  nick: 'lyra',
};

test('command palette builds buffers, friends, and current-buffer actions in order', () => {
  const entries = buildCommandPaletteEntrySpecs({
    connections: [connection],
    friends: [friend],
    selectedBuffer: {
      id: channelBuffer.id,
      label: channelBuffer.target,
    },
    selectedNetwork: {
      available: true,
      id: network.id,
      label: network.name,
    },
    actions: {
      canToggleChannelAutoJoin: true,
      channelAutoJoinActive: false,
      canClearHistory: true,
      canDownloadHistory: true,
      canImportHistory: true,
      canOpenSelfAliases: true,
    },
  });

  assert.deepEqual(
    entries.map((entry) => `${entry.section}:${entry.label}`),
    [
      'buffers:Cuff-Link',
      'buffers:#help',
      'buffers:Nathe',
      'buffers:#pending',
      'friends:Joby',
      'actions:Preferences',
      'actions:Network Manager',
      'actions:List Channels',
      'actions:Enable Autojoin',
      'actions:Clear History',
      'actions:Download History',
      'actions:Import Logs',
      'actions:Self Aliases',
    ],
  );
});

test('command palette filtering matches labels, subtitles, and keywords case-insensitively', () => {
  const entries = buildCommandPaletteEntrySpecs({
    connections: [connection],
    friends: [friend],
    selectedBuffer: {
      id: channelBuffer.id,
      label: channelBuffer.target,
    },
    selectedNetwork: {
      available: true,
      id: network.id,
      label: network.name,
    },
    actions: {
      canToggleChannelAutoJoin: false,
      channelAutoJoinActive: false,
      canClearHistory: false,
      canDownloadHistory: false,
      canImportHistory: true,
      canOpenSelfAliases: false,
    },
  });

  assert.deepEqual(filterCommandPaletteEntries(entries, 'saved friend').map((entry) => entry.label), ['Joby']);
  assert.deepEqual(filterCommandPaletteEntries(entries, 'hexchat').map((entry) => entry.label), ['Import Logs']);
  assert.deepEqual(filterCommandPaletteEntries(entries, 'SOFIA').map((entry) => entry.label), ['Cuff-Link', '#help', 'Nathe', '#pending']);
});

test('command palette scoring promotes exact matches, then current-network unread buffers', () => {
  const currentHelpDesk: BufferState = {
    ...channelBuffer,
    id: 'buffer-helpdesk',
    target: '#helpdesk',
    unread: 4,
  };
  const currentHelper: BufferState = {
    ...channelBuffer,
    id: 'buffer-helper',
    target: '#helper',
    unread: 0,
  };
  const otherExact: BufferState = {
    ...channelBuffer,
    id: 'buffer-other-help',
    networkId: otherNetwork.id,
    target: '#help',
    unread: 1,
  };
  const otherHelpDesk: BufferState = {
    ...channelBuffer,
    id: 'buffer-other-helpdesk',
    networkId: otherNetwork.id,
    target: '#helpdesk',
    unread: 8,
  };
  const otherConnection: SidebarConnectionView = {
    ...connection,
    network: otherNetwork,
    runtime: {
      phase: 'connected',
      serverName: otherNetwork.host,
      nick: otherNetwork.nick,
    },
    serverBuffer: {
      ...serverBuffer,
      id: 'buffer-server-2',
      networkId: otherNetwork.id,
    },
    childBuffers: [
      { buffer: otherExact, selected: false },
      { buffer: otherHelpDesk, selected: false },
    ],
    pendingChannels: [],
    selectedServer: false,
    label: 'OtherNet (lyra)',
    labelParts: {
      name: 'OtherNet',
      nick: 'lyra',
      instanceIndex: null,
    },
  };

  const entries = buildCommandPaletteEntrySpecs({
    connections: [{
      ...connection,
      childBuffers: [
        { buffer: currentHelpDesk, selected: false },
        { buffer: currentHelper, selected: false },
      ],
    }, otherConnection],
    friends: [friend],
    selectedBuffer: {
      id: currentHelpDesk.id,
      label: currentHelpDesk.target,
    },
    selectedNetwork: {
      available: true,
      id: network.id,
      label: network.name,
    },
    actions: {
      canToggleChannelAutoJoin: false,
      channelAutoJoinActive: false,
      canClearHistory: false,
      canDownloadHistory: false,
      canImportHistory: false,
      canOpenSelfAliases: false,
    },
  });

  assert.deepEqual(
    filterCommandPaletteEntries(entries, 'help').map((entry) => entry.label),
    ['#help', '#helpdesk', '#helper', '#helpdesk'],
  );
});

test('command palette active index navigation wraps and handles empty result sets', () => {
  assert.equal(moveCommandPaletteActiveIndex(0, 4, -1), 3);
  assert.equal(moveCommandPaletteActiveIndex(3, 4, 1), 0);
  assert.equal(moveCommandPaletteActiveIndex(-1, 4, 1), 0);
  assert.equal(moveCommandPaletteActiveIndex(-1, 0, 1), -1);
});

test('command palette hotkey requires ctrl/cmd+k without blocking dialogs or composition', () => {
  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  }, {
    blockingDialogOpen: false,
    paletteOpen: false,
  }), true);

  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
  }, {
    blockingDialogOpen: true,
    paletteOpen: false,
  }), false);

  assert.equal(shouldOpenCommandPaletteFromKeydown({
    key: 'k',
    ctrlKey: false,
    metaKey: true,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: true,
  }, {
    blockingDialogOpen: false,
    paletteOpen: false,
  }), false);
});

test('command palette action dispatcher routes each action to the matching handler', async () => {
  const calls: string[] = [];

  await runCommandPaletteAction(
    { kind: 'select-pending-channel', networkId: network.id, channel: '#pending' },
    {
      selectNetwork: (networkId) => { calls.push(`network:${networkId}`); },
      selectBuffer: (bufferId) => { calls.push(`buffer:${bufferId}`); },
      selectPendingChannel: (networkId, channel) => { calls.push(`pending:${networkId}:${channel}`); },
      selectFriend: async (friendId) => { calls.push(`friend:${friendId}`); },
      openPreferences: () => { calls.push('preferences'); },
      openNetworkManager: () => { calls.push('network-manager'); },
      openChannelList: () => { calls.push('channel-list'); },
      toggleCurrentChannelAutoJoin: () => { calls.push('autojoin'); },
      clearBufferHistory: (bufferId) => { calls.push(`clear:${bufferId}`); },
      downloadBufferHistory: (bufferId) => { calls.push(`download:${bufferId}`); },
      openHistoryImport: (bufferId) => { calls.push(`import:${bufferId}`); },
      openSelfAliases: (bufferId) => { calls.push(`aliases:${bufferId}`); },
    },
  );

  await runCommandPaletteAction(
    { kind: 'open-history-import', bufferId: channelBuffer.id },
    {
      selectNetwork: (networkId) => { calls.push(`network:${networkId}`); },
      selectBuffer: (bufferId) => { calls.push(`buffer:${bufferId}`); },
      selectPendingChannel: (networkId, channel) => { calls.push(`pending:${networkId}:${channel}`); },
      selectFriend: async (friendId) => { calls.push(`friend:${friendId}`); },
      openPreferences: () => { calls.push('preferences'); },
      openNetworkManager: () => { calls.push('network-manager'); },
      openChannelList: () => { calls.push('channel-list'); },
      toggleCurrentChannelAutoJoin: () => { calls.push('autojoin'); },
      clearBufferHistory: (bufferId) => { calls.push(`clear:${bufferId}`); },
      downloadBufferHistory: (bufferId) => { calls.push(`download:${bufferId}`); },
      openHistoryImport: (bufferId) => { calls.push(`import:${bufferId}`); },
      openSelfAliases: (bufferId) => { calls.push(`aliases:${bufferId}`); },
    },
  );

  await runCommandPaletteAction(
    { kind: 'open-preferences' },
    {
      selectNetwork: (networkId) => { calls.push(`network:${networkId}`); },
      selectBuffer: (bufferId) => { calls.push(`buffer:${bufferId}`); },
      selectPendingChannel: (networkId, channel) => { calls.push(`pending:${networkId}:${channel}`); },
      selectFriend: async (friendId) => { calls.push(`friend:${friendId}`); },
      openPreferences: () => { calls.push('preferences'); },
      openNetworkManager: () => { calls.push('network-manager'); },
      openChannelList: () => { calls.push('channel-list'); },
      toggleCurrentChannelAutoJoin: () => { calls.push('autojoin'); },
      clearBufferHistory: (bufferId) => { calls.push(`clear:${bufferId}`); },
      downloadBufferHistory: (bufferId) => { calls.push(`download:${bufferId}`); },
      openHistoryImport: (bufferId) => { calls.push(`import:${bufferId}`); },
      openSelfAliases: (bufferId) => { calls.push(`aliases:${bufferId}`); },
    },
  );

  assert.deepEqual(calls, [
    `pending:${network.id}:#pending`,
    `import:${channelBuffer.id}`,
    'preferences',
  ]);
});
