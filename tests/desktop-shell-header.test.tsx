import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { DesktopShell } from '../web/src/DesktopShell.js';
import { emptyNetworkForm } from '../web/src/network-form.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

const network: NetworkProfile = {
  id: 'network-1',
  templateId: null,
  managerHidden: true,
  name: 'TestNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'tester',
  altNicks: ['tester_', 'tester__'],
  username: 'tester',
  realName: 'Tester',
  hasPassword: false,
  authMethod: 'none',
  authTarget: 'NickServ',
  authAccount: '',
  favorite: false,
  autoJoin: [],
};

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: network.id,
  kind: 'channel',
  target: '#general',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const channel: ChannelState = {
  id: channelBuffer.id,
  networkId: network.id,
  name: '#general',
  topic: 'General chat',
  users: [],
};

const createWorkspace = (): WorkspaceView => ({
  mode: 'channel-connected',
  selection: { kind: 'buffer', bufferId: channelBuffer.id },
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: null,
  selectedBuffer: channelBuffer,
  selectedChannel: channel,
  selectedPendingChannel: null,
  headerTitle: channel.name,
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: `Message ${channel.name} or /command`,
  emptyBody: 'Wait for activity or send a message.',
  showNicklist: true,
});

const createModel = (workspace: WorkspaceView) => ({
  workspace,
  header: {
    messageDisplayMode: 'colors' as const,
    showMessageDisplayModeToggle: true,
    onMessageDisplayModeChange: () => undefined,
    onOpenNetworkManager: () => undefined,
    onOpenPreferences: () => undefined,
  },
  commandPalette: {
    open: false,
    entries: [],
    onOpen: () => undefined,
    onClose: () => undefined,
  },
  sidebar: {
    connections: [],
    friends: [],
    friendPresence: {},
    queryPresence: {},
    onAddFriend: async () => true,
    onRemoveFriend: async () => true,
    onSelectFriend: async () => undefined,
    onSelectNetwork: () => undefined,
    onSelectBuffer: () => undefined,
    onSelectPendingChannel: () => undefined,
    onReconnectNetwork: () => undefined,
    onDisconnectNetwork: () => undefined,
    onCloseConnection: () => undefined,
    onCloseChannel: () => undefined,
    onCloseBuffer: () => undefined,
  },
  chat: {
    workspace,
    friends: [],
    selectedMessages: [],
    draft: '',
    messageDisplayMode: 'colors' as const,
    scrollRef: createRef<HTMLDivElement>(),
    onDraftChange: () => undefined,
    onRecallOlderDraft: () => undefined,
    onRecallNewerDraft: () => undefined,
    onSend: async () => undefined,
    onAddFriend: async () => true,
    onRemoveFriend: async () => true,
    showChannelAutoJoin: false,
    channelAutoJoinActive: false,
    onToggleChannelAutoJoin: async () => true,
    canClearHistory: false,
    onClearHistory: async () => true,
    canDownloadHistory: false,
    onDownloadHistory: async () => true,
    canImportHistory: false,
    onImportHistory: async () => true,
    canLoadOlderHistory: false,
    loadingOlderHistory: false,
    onLoadOlderHistory: async () => undefined,
    onCloseChannel: () => undefined,
    onCloseBuffer: () => undefined,
    channelList: { open: false, networkId: null, requestId: null, status: 'idle' as const, entries: [], error: null },
    channelListNetwork: null,
    onCloseChannelList: () => undefined,
    onJoinChannelFromList: async () => undefined,
    onOpenMentionedChannel: () => undefined,
    onOpenParticipantQuery: () => undefined,
    onOpenChannelList: () => undefined,
  },
  nicklist: {
    friends: [],
    mutedNicks: [],
    onAddFriend: async () => true,
    onAddMutedNick: async () => true,
    onRemoveFriend: async () => true,
    onRemoveMutedNick: async () => true,
    onSelectNick: () => undefined,
  },
  preferences: {
    open: false,
    backgroundDmAudio: { enabled: false, systemEnabled: false, sound: 'chirp' as const, contacts: [] },
    mutedNicks: [],
    networks: [network],
    onClose: () => undefined,
    onSetBackgroundDmAudioEnabled: () => undefined,
    backgroundDmAudioSystemPermission: 'default' as const,
    onSetBackgroundDmAudioSystemEnabled: () => undefined,
    onRequestBackgroundDmAudioSystemPermission: async () => 'default' as const,
    onSetBackgroundDmAudioSound: () => undefined,
    onPreviewBackgroundDmAudioSound: () => undefined,
    onRemoveBackgroundDmAudioContact: () => undefined,
    onRemoveMutedNick: async () => true,
  },
  networkManager: {
    open: false,
    networks: [],
    selected: null,
    runtime: null,
    runtimes: {},
    showFavoritesOnly: false,
    onSelect: () => undefined,
    onToggleFavorites: () => undefined,
    onClose: () => undefined,
    onAdd: () => undefined,
    onEdit: () => undefined,
    onDuplicate: () => undefined,
    onRemove: () => undefined,
    onConnect: () => undefined,
    onFavorite: () => undefined,
  },
  networkEditor: {
    open: false,
    form: emptyNetworkForm(),
    activeTab: 'servers' as const,
    onTabChange: () => undefined,
    onClose: () => undefined,
    onSubmit: () => undefined,
    onChange: () => undefined,
  },
});

test('desktop shell header avoids rendering any secondary context line', () => {
  const markup = renderToStaticMarkup(<DesktopShell {...createModel(createWorkspace())} />);

  assert.match(markup, />Pulsete</);
  assert.doesNotMatch(markup, /<p class="truncate pt-1 font-mono text-\[10px\] uppercase tracking-\[0\.22em\] text-muted-foreground">/);
});
