import type {
  BufferState,
  FriendState,
  NetworkProfile,
} from '../../shared/protocol.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';

export type ConnectionSidebarProps = {
  connections: SidebarConnectionView[];
  friends: FriendState[];
  friendPresence: Record<string, boolean>;
  queryPresence?: Record<string, boolean>;
  onAddFriend: (nick: string) => Promise<boolean>;
  onRemoveFriend: (friendId: string) => Promise<boolean>;
  onSelectFriend: (friend: FriendState) => Promise<void>;
  onSelectNetwork: (network: NetworkProfile) => void;
  onSelectBuffer: (buffer: BufferState) => void;
  onSelectPendingChannel: (networkId: string, channel: string) => void;
  onReconnectNetwork: (network: NetworkProfile) => void;
  onDisconnectNetwork: (networkId: string) => void;
  onCloseConnection: (network: NetworkProfile) => void;
  onCloseChannel: (networkId: string, channel: string) => void;
  onCloseBuffer: (buffer: BufferState) => void;
};
