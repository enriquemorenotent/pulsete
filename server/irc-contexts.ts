import type { IrcConnectionState } from './irc-types.js';

export type IrcEventContext = Pick<IrcConnectionState, 'handlers' | 'profile'>;

export type IrcStateContext = Pick<IrcConnectionState, 'handlers' | 'profile' | 'lifecycle'>;

export type IrcReplyStateContext = IrcConnectionState;

export type IrcChannelListContext = IrcConnectionState;

export type IrcChannelStateContext = IrcConnectionState;

export type IrcFriendPresenceContext = IrcConnectionState;

export type IrcRawIoContext = IrcConnectionState;

export type IrcClientIoContext = IrcConnectionState;

export type IrcLifecycleContext = IrcConnectionState;

export type IrcConnectContext = IrcConnectionState;
