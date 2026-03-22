import type { ChannelUserState, NetworkRuntimeState } from '../shared/protocol.js';
import type { IrcConnectionPorts } from './irc-port-types.js';
import type {
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
} from './irc-state-types.js';
import type { MessageInput, RuntimeNetworkProfile } from './storage-types.js';

export type RuntimeEvent =
  | { type: 'state'; networkId: string; phase: NetworkRuntimeState['phase']; serverName: string | null; nick: string }
  | {
      type: 'status';
      networkId: string;
      message: string;
      kind: 'notice' | 'error' | 'system';
      target?: string;
      requireBoundTarget?: boolean;
    }
  | { type: 'channel-pending'; networkId: string; channel: string }
  | { type: 'channel-pending-remove'; networkId: string; channel: string }
  | {
      type: 'channel-list-entry';
      networkId: string;
      requestId: string;
      entry: { name: string; users: number; topic: string };
    }
  | { type: 'channel-list-completed'; networkId: string; requestId: string }
  | { type: 'channel-list-failed'; networkId: string; requestId: string; message: string }
  | { type: 'message'; message: MessageInput }
  | { type: 'friend-presence'; networkId: string; onlineNicks: string[] }
  | { type: 'channel'; networkId: string; channel: string; topic?: string; users?: ChannelUserState[] };

export type Handlers = {
  onEvent: (event: RuntimeEvent) => void;
};

export type IrcConnectionState = {
  profile: RuntimeNetworkProfile;
  handlers: Handlers;
  lifecycle: IrcLifecycleState;
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  channelList: IrcChannelListState;
  replyTracker: IrcReplyTracker;
  ports: IrcConnectionPorts;
};

export type {
  ChannelSessionPhase,
  ChannelSessionState,
  FriendPresencePollState,
  IrcChannelListActiveState,
  IrcChannelListDrainingState,
  IrcChannelListMode,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
  IrcSocket,
} from './irc-state-types.js';
