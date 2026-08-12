import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, NetworkProfile } from '../shared/protocol-chat.js';
import {
  WorkspaceRightSidebar,
  type WorkspaceRightSidebarProps,
} from '../web/src/WorkspaceRightSidebar.js';
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

const nicklist: WorkspaceRightSidebarProps['nicklist'] = {
  friends: [],
  nickEmojis: [],
  mutedNicks: [],
  contactNotificationSettings: { contacts: [] },
  contactRuleHandlers: noopContactRuleHandlers,
  externalAvatarsEnabled: false,
  onSaveNickEmoji: async () => true,
  onSelectNick: () => undefined,
};

const renderQueryProfileSidebar = (
  queryProfile: Partial<NonNullable<Parameters<typeof WorkspaceRightSidebar>[0]['queryProfile']>> = {},
) =>
  renderToStaticMarkup(
    <WorkspaceRightSidebar
      workspace={queryWorkspace}
      nicklist={nicklist}
      queryProfile={{
        buffer: queryBuffer,
        onSaveNotes: async () => queryBuffer,
        ...queryProfile,
      }}
    />,
  );

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
  assert.match(markup, /aria-label="Collapse right sidebar"/);
  assert.match(markup, /Connection/);
  assert.match(markup, /overflow-y-auto[\s\S]*data-server-sidebar-section="connection"[\s\S]*open=""/);
  assert.match(markup, /Status[\s\S]*Online/);
  assert.match(markup, /Nick[\s\S]*mira/);
  assert.match(markup, /Auth[\s\S]*No auth/);
  assert.match(markup, /Autojoin[\s\S]*Manual/);
  assert.match(markup, /flex min-h-72 p-0[\s\S]*relative flex-1[\s\S]*server-profile-notes[\s\S]*aria-label="Notes"[\s\S]*h-full min-h-full[\s\S]*pr-16/);
  assert.doesNotMatch(markup, /for="server-profile-notes"[\s\S]*?>Notes<\/label>/);
  assert.match(markup, /Character: Mira/);
  assert.match(markup, /Current plot: bridge watch/);
  assert.match(markup, /sr-only[\s\S]*Saved/);
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

test('server profile sidebar hides empty capabilities', () => {
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

  assert.doesNotMatch(markup, /Capabilities/);
  assert.doesNotMatch(markup, /No capabilities reported yet/);
});

test('query profile sidebar renders the per-DM notes editor', () => {
  const markup = renderQueryProfileSidebar();

  assert.match(markup, /aria-label="Info"/);
  assert.match(markup, /aria-label="Pinned"/);
  assert.match(markup, /aria-label="Assistant"/);
  assert.match(markup, /aria-label="Collapse right sidebar"/);
  assert.match(markup, /Notes/);
  assert.doesNotMatch(markup, /Private message/);
  assert.doesNotMatch(markup, /<h2[^>]*>Sofia<\/h2>/);
  assert.doesNotMatch(markup, /Sofia on RoleplayNet/);
  assert.doesNotMatch(markup, /Details/);
  assert.doesNotMatch(markup, /Identity/);
  assert.doesNotMatch(markup, /aria-label="Edit emoji tag for Sofia"/);
  assert.doesNotMatch(markup, /aria-label="(?:Custom )?Avatar for Sofia"/);
  assert.doesNotMatch(markup, /avatar-redirect/);
  assert.match(markup, /flex min-h-0 flex-1 px-4 py-4/);
  assert.match(markup, /flex min-h-0 flex-col flex-1 gap-2\.5/);
  assert.match(markup, /relative flex-1 min-h-40[\s\S]*query-profile-notes/);
  assert.doesNotMatch(markup, /h-\[min\(32dvh,18rem\)\]/);
  assert.match(markup, /Prefers encrypted routes/);
  assert.match(markup, /Saved/);
});
