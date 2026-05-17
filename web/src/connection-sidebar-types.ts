import type { BufferState, FriendState, NetworkProfile, NickEmojiState, PresenceStatus } from '../../shared/protocol-chat.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { NavigationLayoutMode } from './navigation-layout-settings.js';

export type ConnectionSidebarProps = {
  connections: SidebarConnectionView[];
  friends: FriendState[];
  friendPresence: Record<string, PresenceStatus>;
  hideOfflineFriends?: boolean;
  navigationLayoutMode?: NavigationLayoutMode;
  nickEmojis: NickEmojiState[];
  queryPresence?: Record<string, PresenceStatus>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectFriend: (friend: FriendState) => Promise<void>;
  onToggleHideOfflineFriends?: () => void;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectBuffer: (buffer: BufferState) => void;
  onSelectPendingChannel: (networkId: string, channel: string) => void;
  onReconnectNetwork: (network: NetworkProfile) => void;
  onDisconnectNetwork: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
};
