import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, ChannelState, NetworkProfile } from '../shared/protocol.js';
import { emptyAssistantSnapshot } from '../web/src/assistant-state.js';
import { DesktopShell } from '../web/src/DesktopShell.js';
import type { DesktopShellModel } from '../web/src/desktop-shell-model.js';
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

const createWorkspace = (overrides: Partial<WorkspaceView>): WorkspaceView => ({
  mode: 'server-connected',
  selection: { kind: 'buffer', bufferId: serverBuffer.id },
  connectionInstances: [network],
  selectedNetwork: network,
  selectedRuntime: null,
  selectedBuffer: serverBuffer,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: 'server',
  headerSubtitle: '',
  composerMode: 'normal',
  composerPlaceholder: 'Type a message',
  emptyBody: '',
  showNicklist: false,
  ...overrides,
});

const createModel = (workspace: WorkspaceView): DesktopShellModel => ({
  workspace,
  header: {
    messageDisplayMode: 'colors',
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
    messageDisplayMode: 'colors',
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
    channelList: {
      open: false,
      networkId: null,
      requestId: null,
      status: 'idle',
      entries: [],
      error: null,
    },
    channelListNetwork: null,
    onCloseChannelList: () => undefined,
    onJoinChannelFromList: async () => undefined,
    onOpenMentionedChannel: () => undefined,
    onOpenParticipantQuery: () => undefined,
    onOpenChannelList: () => undefined,
  },
  nicklist: {
    friends: [],
    onAddFriend: async () => true,
    onRemoveFriend: async () => true,
    onSelectNick: () => undefined,
  },
  assistant: {
    activeBufferLabel: workspace.selectedBuffer?.target ?? null,
    assistant: emptyAssistantSnapshot,
    contextSubtitle: 'Ask the assistant about this buffer.',
    contextKey: workspace.selectedBuffer?.id ?? 'none',
    contextTitle: workspace.headerTitle,
    loading: false,
    busy: false,
    resolvedSubjectLabel: null,
    subjectPending: false,
    thread: null,
    onNewChat: async () => true,
    onOpenChannel: () => undefined,
    onStop: async () => true,
    onSubmitPrompt: async () => true,
  },
  preferences: {
    open: false,
    assistant: emptyAssistantSnapshot,
    backgroundDmAudio: {
      enabled: false,
      systemEnabled: false,
      sound: 'chirp',
      contacts: [],
    },
    networks: [network],
    onClose: () => undefined,
    onStartLogin: async () => undefined,
    onCancelLogin: async () => undefined,
    onLogout: async () => undefined,
    onChangeModel: async () => undefined,
    onSetBackgroundDmAudioEnabled: () => undefined,
    backgroundDmAudioSystemPermission: 'default',
    onSetBackgroundDmAudioSystemEnabled: () => undefined,
    onRequestBackgroundDmAudioSystemPermission: async () => 'default',
    onSetBackgroundDmAudioSound: () => undefined,
    onPreviewBackgroundDmAudioSound: () => undefined,
    onRemoveBackgroundDmAudioContact: () => undefined,
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
    activeTab: 'servers',
    onTabChange: () => undefined,
    onClose: () => undefined,
    onSubmit: () => undefined,
    onChange: () => undefined,
  },
});

test('desktop shell renders a second resize handle when the right sidebar is visible', () => {
  const markup = renderToStaticMarkup(
    <DesktopShell
      {...createModel(createWorkspace({
        mode: 'channel-connected',
        selection: { kind: 'buffer', bufferId: channelBuffer.id },
        selectedBuffer: channelBuffer,
        selectedChannel: channel,
        headerTitle: '#general',
        showNicklist: true,
      }))}
    />
  );

  assert.match(markup, /aria-label="Resize left sidebar"/);
  assert.match(markup, /aria-label="Resize right sidebar"/);
});

test('desktop shell keeps only the left resize handle when no right sidebar is available', () => {
  const markup = renderToStaticMarkup(
    <DesktopShell {...createModel(createWorkspace({}))} />
  );

  assert.match(markup, /aria-label="Resize left sidebar"/);
  assert.doesNotMatch(markup, /aria-label="Resize right sidebar"/);
});

test('desktop shell renders a visible command palette trigger in the header', () => {
  const markup = renderToStaticMarkup(
    <DesktopShell {...createModel(createWorkspace({}))} />
  );

  assert.match(markup, /Go to…/);
  assert.match(markup, /Ctrl\/Cmd\+K/);
});
