import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, NetworkProfile } from '../shared/protocol.js';
import { WorkspaceRightSidebar } from '../web/src/WorkspaceRightSidebar.js';
import type { DesktopShellNicklistModel } from '../web/src/desktop-shell-model.js';
import type { WorkspaceView } from '../web/src/workspace-types.js';

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

const nicklist: DesktopShellNicklistModel = {
  friends: [],
  mutedNicks: [],
  backgroundDmAudio: { contacts: [] },
  onAddFriend: async () => true,
  onAddNotificationContact: () => undefined,
  onAddMutedNick: async () => true,
  onRemoveFriend: async () => true,
  onRemoveNotificationContact: () => undefined,
  onRemoveMutedNick: async () => true,
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
});
