import {
  createIrcChannelListPort,
  createIrcChannelPort,
  createIrcCommandPort,
  createIrcFriendPresencePort,
  createIrcLifecyclePort,
  createIrcReplyPort,
  createIrcTransportPort,
  createRuntimeIrcSession,
} from './irc-ports.js';
import { defineIrcConnectionAliases } from './irc-connection-aliases.js';
import { ReplyTracker } from './irc-reply-tracker.js';
import type { ChannelUserState } from '../shared/protocol.js';
import type {
  ChannelSessionState,
  Handlers,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcConnectionState,
  IrcFriendPresenceState,
  IrcLifecycleState,
} from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const defaultChannelJoinTimeoutMs = 15_000;
const defaultChannelListTimeoutMs = 60_000;
const defaultChannelListDrainGraceMs = 15_000;

type IrcConnectionOptions = {
  channelJoinTimeoutMs?: number;
  channelListTimeoutMs?: number;
  channelListDrainGraceMs?: number;
};

const createConnectionState = (
  profile: RuntimeNetworkProfile,
  handlers: Handlers,
  options: IrcConnectionOptions = {}
): IrcConnection => {
  const lifecycle: IrcLifecycleState = {
    socket: null,
    buffer: '',
    connectDeadlineTimer: null,
    manualDisconnect: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    connected: false,
    serverName: null,
    currentNick: profile.nick,
    lastFailureMessage: null,
  };
  const channels: IrcChannelTrackingState = {
    users: new Map<string, ChannelUserState[]>(),
    sessions: new Map<string, ChannelSessionState>(),
    joinTimeoutMs: options.channelJoinTimeoutMs ?? defaultChannelJoinTimeoutMs,
  };
  const friendPresence: IrcFriendPresenceState = {
    nicks: [],
    onlineKeys: new Set<string>(),
    timer: null,
    pendingPoll: null,
    nextPollId: 0,
    enabled: true,
  };
  const channelList: IrcChannelListState = {
    active: {
      mode: null,
      sourceTarget: null,
      requestId: null,
      entries: [],
    },
    draining: {
      mode: null,
      sourceTarget: null,
      requestId: null,
      expiresAt: null,
    },
    timeoutTimer: null,
    timeoutMs: options.channelListTimeoutMs ?? defaultChannelListTimeoutMs,
    drainGraceMs: options.channelListDrainGraceMs ?? defaultChannelListDrainGraceMs,
  };
  const connection = {
    profile,
    handlers,
    lifecycle,
    channels,
    friendPresence,
    channelList,
    replyTracker: new ReplyTracker(),
  } as unknown as IrcConnection;

  const lifecyclePort = createIrcLifecyclePort(connection);
  const commandPort = createIrcCommandPort(connection);
  const friendPresencePort = createIrcFriendPresencePort(connection);
  const replyPort = createIrcReplyPort(connection);
  const transportPort = createIrcTransportPort(connection);
  const channelListPort = createIrcChannelListPort(connection);
  const channelPort = createIrcChannelPort(connection);

  Object.assign(
    connection,
    lifecyclePort,
    commandPort,
    friendPresencePort,
    replyPort,
    transportPort,
    channelListPort,
    channelPort
  );
  defineIrcConnectionAliases({
    connection,
    lifecycle,
    channels,
    friendPresence,
    channelList,
    replyTracker: connection.replyTracker,
    runtimeSession: createRuntimeIrcSession({
      lifecycle,
      lifecyclePort,
      commandPort,
      friendPresencePort,
      transportPort,
      channelListPort,
      channelPort,
    }),
    state: () => lifecyclePort.state,
  });

  return connection;
};

export interface IrcConnection extends IrcConnectionState {}

export class IrcConnection {
  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    return createConnectionState(profile, handlers, options);
  }
}
