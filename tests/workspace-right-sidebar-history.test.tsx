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
  altNicks: [],
  realName: 'Mira',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
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

const workspace: WorkspaceView = {
  mode: 'server-connected',
  selection: { kind: 'buffer', bufferId: serverBuffer.id },
  workspaceNetworks: [network],
  selectedNetwork: network,
  selectedRuntime: {
    phase: 'connected',
    serverName: 'irc.example.test',
    nick: network.nick,
    capabilities: {
      offered: ['draft/chathistory', 'draft/chathistory-end'],
      negotiated: ['echo-message'],
      pending: [],
      values: { 'draft/chathistory': '50', 'isupport/chathistory': '25' },
    },
  },
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

test('server profile sidebar renders chat history capability details', () => {
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

  assert.match(markup, /History/);
  assert.match(markup, /Backfill[\s\S]*Offered by server/);
  assert.match(markup, /Page size[\s\S]*Up to 25 messages/);
  assert.match(markup, /End marker[\s\S]*Offered by server/);
  assert.match(markup, /Retention[\s\S]*Not advertised/);
});
