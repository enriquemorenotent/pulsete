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
import { defineLegacyIrcConnectionCompat, type LegacyIrcConnectionCompat } from './irc-connection-compat.js';
import type { IrcConnectionPorts } from './irc-port-types.js';
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
import type { RuntimeIrcSession } from './irc-port-types.js';
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
    ports: null as unknown as IrcConnectionPorts,
    runtimeSession: null as unknown as RuntimeIrcSession,
  } as unknown as IrcConnection;

  const lifecyclePort = createIrcLifecyclePort(connection);
  const commandPort = createIrcCommandPort(connection);
  const friendPresencePort = createIrcFriendPresencePort(connection);
  const replyPort = createIrcReplyPort(connection);
  const transportPort = createIrcTransportPort(connection);
  const channelListPort = createIrcChannelListPort(connection);
  const channelPort = createIrcChannelPort(connection);

  connection.ports = {
    lifecycle: lifecyclePort,
    command: commandPort,
    friendPresence: friendPresencePort,
    reply: replyPort,
    transport: transportPort,
    channelList: channelListPort,
    channels: channelPort,
  };
  connection.runtimeSession = createRuntimeIrcSession({
    lifecycle,
    lifecyclePort,
    commandPort,
    friendPresencePort,
    transportPort,
    channelListPort,
    channelPort,
  });
  defineLegacyIrcConnectionCompat(connection);

  return connection;
};

export interface IrcConnection extends IrcConnectionState, LegacyIrcConnectionCompat {}

export class IrcConnection {
  constructor(profile: RuntimeNetworkProfile, handlers: Handlers, options: IrcConnectionOptions = {}) {
    return createConnectionState(profile, handlers, options);
  }
}
