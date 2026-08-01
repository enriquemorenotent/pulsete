import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
import { WorkspaceRightSidebar } from '../web/src/WorkspaceRightSidebar.js';
import type { DesktopShellNicklistModel } from '../web/src/desktop-shell-model.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';
import { noopContactRuleHandlers } from './chat-pane.test.renderers.js';
import { createAiAssistantStore } from '../web/src/ai-assistant-store.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'RoleplayNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'mira',
  altNicks: [],
  realName: 'Mira',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
};

const channelBuffer = createBuffer('channel-buffer-1', 'channel', '#lobby');
const queryBuffer = createBuffer('query-buffer-1', 'query', 'Sofia');

const nicklist: DesktopShellNicklistModel = {
  friends: [],
  nickEmojis: [],
  mutedNicks: [],
  contactNotificationSettings: { contacts: [] },
  contactRuleHandlers: noopContactRuleHandlers,
  externalAvatarsEnabled: false,
  onSaveNickEmoji: async () => true,
  onSelectNick: () => undefined,
};

test('channel sidebar exposes members and assistant tabs', () => {
  const assistantStore = createAiAssistantStore();
  assistantStore.setInput(channelBuffer.id, 'Keep this draft');
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={{
        ...createWorkspace(channelBuffer),
        mode: 'channel-connected',
        selectedChannel: {
          id: channelBuffer.id,
          name: channelBuffer.target,
          networkId: network.id,
          topic: '',
          users: [],
        },
        showNicklist: true,
      }}
      nicklist={nicklist}
      assistant={{
        buffer: channelBuffer,
        onUseSuggestion: () => undefined,
        store: assistantStore,
      }}
    />,
  );

  assert.match(markup, /aria-label="Sidebar views"/);
  assert.match(markup, /aria-label="Members"/);
  assert.match(markup, /lucide-users/);
  assert.match(markup, /aria-label="Assistant"/);
  assert.match(markup, /lucide-sparkles/);
  assert.match(markup, /aria-label="Collapse right sidebar"/);
  assert.match(markup, />New chat</);
  assert.doesNotMatch(markup, /Private assistant/);
  assert.match(markup, /content-assistant[\s\S]*data-\[state=inactive\]:hidden/);
});

test('private message sidebar exposes info and assistant tabs', () => {
  const assistantStore = createAiAssistantStore();
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={{
        ...createWorkspace(queryBuffer),
        mode: 'query-connected',
        headerTitle: queryBuffer.target,
      }}
      nicklist={nicklist}
      queryProfile={{
        buffer: queryBuffer,
        onSaveNotes: async () => queryBuffer,
      }}
      assistant={{
        buffer: queryBuffer,
        onUseSuggestion: () => undefined,
        store: assistantStore,
      }}
    />,
  );

  assert.match(markup, /aria-label="Sidebar views"/);
  assert.match(markup, /aria-label="Info"/);
  assert.match(markup, /lucide-info/);
  assert.match(markup, /aria-label="Assistant"/);
  assert.match(markup, /lucide-sparkles/);
  assert.match(markup, /aria-label="Collapse right sidebar"/);
  assert.doesNotMatch(markup, />New chat</);
  assert.doesNotMatch(markup, /Private assistant/);
  assert.match(markup, /content-assistant[\s\S]*data-\[state=inactive\]:hidden/);
});

function createWorkspace(buffer: BufferState): WorkspaceView {
  return {
    mode: 'query-connected',
    selection: { kind: 'buffer', bufferId: buffer.id },
    workspaceNetworks: [network],
    selectedNetwork: network,
    selectedRuntime: { phase: 'connected', serverName: network.host, nick: network.nick },
    selectedBuffer: buffer,
    selectedChannel: null,
    selectedPendingChannel: null,
    headerTitle: buffer.target,
    headerSubtitle: `${buffer.target} @ ${network.name}`,
    composerMode: 'normal',
    composerPlaceholder: `Message ${buffer.target}`,
    emptyBody: '',
    showNicklist: false,
  };
}

function createBuffer(
  id: string,
  kind: BufferState['kind'],
  target: string,
): BufferState {
  return {
    id,
    kind,
    lastReadMessageId: null,
    lastReadTs: null,
    networkId: network.id,
    priorityUnread: 0,
    target,
    unread: 0,
  };
}
