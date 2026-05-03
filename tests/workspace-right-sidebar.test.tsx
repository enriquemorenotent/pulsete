import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
import { WorkspaceRightSidebar } from '../web/src/WorkspaceRightSidebar.js';
import type { DesktopShellNicklistModel } from '../web/src/desktop-shell-model.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';
import { noopContactRuleHandlers } from './chat-pane.test.renderers.js';

const network: NetworkProfile = {
  id: 'network-1',
  workspaceOpen: true,
  name: 'RoleplayNet',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'mira',
  altNicks: ['mira_', 'mira__'],
  username: 'mira',
  realName: 'Mira',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
  notes: 'Character: Mira\nCurrent plot: bridge watch',
};

const serverBuffer: BufferState = {
  id: 'server-buffer-1',
  networkId: network.id,
  kind: 'server',
  target: 'server',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const queryBuffer: BufferState = {
  id: 'query-buffer-1',
  networkId: network.id,
  kind: 'query',
  target: 'Sofia',
  notes: 'Prefers encrypted routes',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const workspace: WorkspaceView = {
  mode: 'server-connected',
  selection: { kind: 'buffer', bufferId: serverBuffer.id },
  workspaceNetworks: [network],
  selectedNetwork: network,
  selectedRuntime: { phase: 'connected', serverName: 'irc.example.test', nick: network.nick },
  selectedBuffer: serverBuffer,
  selectedChannel: null,
  selectedPendingChannel: null,
  headerTitle: '',
  headerSubtitle: 'mira @ irc.example.test',
  composerMode: 'commands',
  composerPlaceholder: 'Send a server command',
  emptyBody: '',
  showNicklist: false,
};

const queryWorkspace: WorkspaceView = {
  ...workspace,
  mode: 'query-connected',
  selection: { kind: 'buffer', bufferId: queryBuffer.id },
  selectedBuffer: queryBuffer,
  headerTitle: 'Sofia',
  headerSubtitle: 'Sofia @ RoleplayNet',
  composerMode: 'normal',
  composerPlaceholder: 'Message Sofia',
  showNicklist: false,
};

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

test('server profile sidebar renders the per-network notes editor', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={workspace}
      nicklist={nicklist}
      serverProfile={{
        network,
        onEdit: () => undefined,
        onSaveNotes: async () => null,
      }}
    />,
  );

  assert.match(markup, /RoleplayNet/);
  assert.match(markup, /server-profile-notes/);
  assert.match(markup, /Character: Mira/);
  assert.match(markup, /Current plot: bridge watch/);
  assert.match(markup, /Saved/);
  assert.doesNotMatch(markup, />Save<\/button>/);
});

test('server profile sidebar renders grouped IRC capabilities', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={{
        ...workspace,
        selectedRuntime: {
          phase: 'connecting',
          serverName: null,
          nick: network.nick,
          capabilities: {
            offered: ['account-tag', 'echo-message', 'userhost-in-names'],
            negotiated: ['echo-message'],
            pending: ['userhost-in-names'],
          },
        },
      }}
      nicklist={nicklist}
      serverProfile={{
        network,
        onEdit: () => undefined,
        onSaveNotes: async () => null,
      }}
    />,
  );

  assert.match(markup, /Capabilities/);
  assert.match(markup, /Active[\s\S]*echo-message/);
  assert.match(markup, /Offered[\s\S]*account-tag/);
  assert.match(markup, /Pending[\s\S]*userhost-in-names/);
  assert.doesNotMatch(markup, /No capabilities reported yet/);
});

test('server profile sidebar renders an empty capability state', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={{
        ...workspace,
        selectedRuntime: {
          phase: 'connected',
          serverName: 'irc.example.test',
          nick: network.nick,
          capabilities: { offered: [], negotiated: [], pending: [] },
        },
      }}
      nicklist={nicklist}
      serverProfile={{
        network,
        onEdit: () => undefined,
        onSaveNotes: async () => null,
      }}
    />,
  );

  assert.match(markup, /Capabilities/);
  assert.match(markup, /No capabilities reported yet/);
});

test('query profile sidebar renders the per-DM notes editor', () => {
  const markup = renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={queryWorkspace}
      nicklist={nicklist}
      queryProfile={{
        buffer: queryBuffer,
        nickEmoji: { id: 'nick-emoji-1', networkId: network.id, nick: 'sofia', emoji: '🌙' },
        network,
        onSaveNotes: async () => queryBuffer,
        onSaveNickEmoji: async () => true,
      }}
    />,
  );

  assert.match(markup, /Private message/);
  assert.doesNotMatch(
    markup,
    /<span class="truncate">Sofia<\/span><span aria-hidden="true" class="shrink-0 leading-none">🌙<\/span>/,
  );
  assert.match(markup, /Sofia/);
  assert.match(markup, /aria-label="Edit emoji tag for Sofia"/);
  assert.match(markup, /query-profile-notes/);
  assert.match(markup, /Prefers encrypted routes/);
  assert.match(markup, /Saved/);
});
