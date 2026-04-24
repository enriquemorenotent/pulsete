import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, FriendState, NetworkProfile, PresenceStatus } from '../../shared/protocol.js';
import { ConnectionSidebar } from '../../web/src/ConnectionSidebar.js';
import { buildConnectionSidebarView } from '../../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../../web/src/conversation-selectors.js';
import type { NetworkRuntimeState } from '../../web/src/workspace.js';

type SidebarViewInput = Parameters<typeof buildConnectionSidebarView>[0];

type RenderConnectionSidebarOptions = {
  buffers?: BufferState[];
  friends?: FriendState[];
  friendPresence?: Record<string, PresenceStatus>;
  hideOfflineFriends?: boolean;
  networks?: NetworkProfile[];
  networkStates?: Record<string, NetworkRuntimeState>;
  selection?: SidebarViewInput['selection'];
};

export const makeSidebarNetwork = (
  overrides: Partial<NetworkProfile> = {},
): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  templateId: overrides.templateId ?? null,
  managerHidden: overrides.managerHidden ?? true,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  username: overrides.username ?? 'sofia',
  realName: overrides.realName ?? 'Sofia',
  hasPassword: overrides.hasPassword ?? false,
  favorite: overrides.favorite ?? false,
  autoJoin: overrides.autoJoin ?? [],
});

export const makeSidebarBuffer = (overrides: Partial<BufferState> = {}): BufferState => ({
  id: overrides.id ?? 'buffer-1',
  networkId: overrides.networkId ?? 'network-1',
  kind: overrides.kind ?? 'server',
  target: overrides.target ?? 'server',
  unread: overrides.unread ?? 0,
  priorityUnread: overrides.priorityUnread ?? 0,
  lastReadTs: overrides.lastReadTs ?? null,
  lastReadMessageId: overrides.lastReadMessageId ?? null,
});

export const makeSidebarRuntime = (
  overrides: Partial<NetworkRuntimeState> = {},
): NetworkRuntimeState => ({
  phase: overrides.phase ?? 'offline',
  serverName: overrides.serverName ?? null,
  nick: overrides.nick ?? 'sofia',
});

export const renderConnectionSidebar = (options: RenderConnectionSidebarOptions = {}) =>
  renderToStaticMarkup(
    <ConnectionSidebar
      connections={buildConnectionSidebarView({
        networks: options.networks ?? [],
        conversation: buildConversationIndex({
          buffers: options.buffers ?? [],
          channels: [],
          pendingChannels: [],
          messages: {},
        }),
        networkStates: options.networkStates ?? {},
        selection: options.selection ?? null,
      })}
      friends={options.friends ?? []}
      friendPresence={options.friendPresence ?? {}}
      hideOfflineFriends={options.hideOfflineFriends}
      onAddFriend={async () => true}
      onRemoveFriend={async () => true}
      onSelectFriend={async () => undefined}
      onToggleHideOfflineFriends={() => undefined}
      onSelectNetwork={() => undefined}
      onSelectBuffer={() => undefined}
      onSelectPendingChannel={() => undefined}
      onReconnectNetwork={() => undefined}
      onDisconnectNetwork={() => undefined}
      onCloseConnection={() => undefined}
      onCloseChannel={() => undefined}
      onCloseBuffer={() => undefined}
    />,
  );
