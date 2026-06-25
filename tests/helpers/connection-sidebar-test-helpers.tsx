import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState, FriendState, NetworkProfile, NickEmojiState, PresenceStatus } from '../../shared/protocol-chat.js';
import { ConnectionSidebar } from '../../web/src/ConnectionSidebar.js';
import { buildConnectionSidebarView } from '../../web/src/connection-sidebar-view.js';
import { buildConversationIndex } from '../../web/src/conversation-selectors.js';
import type { MediaVisibilityPolicy } from '../../web/src/media-visibility-settings.js';
import type { NetworkRuntimeState } from '../../web/src/workspace.js';

type SidebarViewInput = Parameters<typeof buildConnectionSidebarView>[0];

type RenderConnectionSidebarOptions = {
  buffers?: BufferState[];
  externalAvatarsEnabled?: boolean;
  friends?: FriendState[];
  friendPresence?: Record<string, PresenceStatus>;
  hideOfflineFriends?: boolean;
  mediaPolicy?: MediaVisibilityPolicy;
  nickEmojis?: NickEmojiState[];
  networks?: NetworkProfile[];
  networkStates?: Record<string, NetworkRuntimeState>;
  selection?: SidebarViewInput['selection'];
};

export const makeSidebarNetwork = (
  overrides: Partial<NetworkProfile> = {},
): NetworkProfile => ({
  id: overrides.id ?? 'network-1',
  workspaceOpen: overrides.workspaceOpen ?? true,
  name: overrides.name ?? 'Cuff-Link',
  host: overrides.host ?? 'irc.example.test',
  port: overrides.port ?? 6697,
  tls: overrides.tls ?? true,
  nick: overrides.nick ?? 'sofia',
  username: overrides.username,
  altNicks: overrides.altNicks ?? ['sofia_', 'sofia__'],
  realName: overrides.realName ?? 'Sofia',
  iconUrl: overrides.iconUrl,
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
      externalAvatarsEnabled={options.externalAvatarsEnabled}
      friends={options.friends ?? []}
      friendPresence={options.friendPresence ?? {}}
      hideOfflineFriends={options.hideOfflineFriends}
      mediaPolicy={options.mediaPolicy}
      nickEmojis={options.nickEmojis ?? []}
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
