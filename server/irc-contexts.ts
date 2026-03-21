import type {
  Handlers,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
} from './irc-types.js';
import type { IrcConnectionPorts } from './irc-port-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type IrcEventContext = {
  handlers: Handlers;
  profile: RuntimeNetworkProfile;
};

export type IrcStateContext = IrcEventContext & {
  lifecycle: IrcLifecycleState;
  ports: IrcConnectionPorts;
};

export type IrcReplyStateContext = {
  channelList: IrcChannelListState;
  ports: Pick<IrcConnectionPorts, 'channelList'>;
  replyTracker: IrcReplyTracker;
};

export type IrcChannelListContext = IrcStateContext & IrcReplyStateContext & {
  ports: Pick<IrcConnectionPorts, 'channelList' | 'reply' | 'transport'>;
};

export type IrcChannelStateContext = IrcEventContext & {
  channels: IrcChannelTrackingState;
  ports: Pick<IrcConnectionPorts, 'reply'>;
  profile: RuntimeNetworkProfile;
  replyTracker: IrcReplyTracker;
};

export type IrcFriendPresenceContext = IrcStateContext & {
  friendPresence: IrcFriendPresenceState;
  ports: Pick<IrcConnectionPorts, 'reply' | 'transport'>;
  replyTracker: IrcReplyTracker;
};

export type IrcRawIoContext = IrcStateContext;

export type IrcClientIoContext = IrcStateContext & IrcReplyStateContext & {
  ports: Pick<IrcConnectionPorts, 'channelList' | 'command' | 'channels' | 'reply' | 'transport'>;
};

export type IrcLifecycleContext = IrcChannelListContext & {
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  ports: Pick<IrcConnectionPorts, 'channelList' | 'command' | 'friendPresence' | 'lifecycle' | 'reply' | 'transport'>;
  replyTracker: IrcReplyTracker;
};

export type IrcConnectContext = IrcLifecycleContext & {
  ports: Pick<IrcConnectionPorts, 'lifecycle' | 'transport'>;
};
