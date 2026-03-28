import type { ChannelUserState, PresenceStatus } from '../shared/protocol.js';
import { createIdleSaslState, resolveDeferredNickservAutoJoinTarget } from './irc-auth.js';
import { ReplyTracker } from './irc-reply-tracker.js';
import type {
  ChannelSessionState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
} from './irc-state-types.js';
import type { Handlers, IrcConnectionData } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const defaultChannelJoinTimeoutMs = 15_000;
const defaultChannelListTimeoutMs = 60_000;
const defaultChannelListDrainGraceMs = 15_000;

export type IrcConnectionOptions = {
  channelJoinTimeoutMs?: number;
  channelListTimeoutMs?: number;
  channelListDrainGraceMs?: number;
};

export const createIrcConnectionState = (
  profile: RuntimeNetworkProfile,
  handlers: Handlers,
  options: IrcConnectionOptions = {}
): IrcConnectionData => {
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
    sasl: createIdleSaslState(),
    pendingNickservAutoJoinTarget: resolveDeferredNickservAutoJoinTarget(profile),
  };
  const channels: IrcChannelTrackingState = {
    users: new Map<string, ChannelUserState[]>(),
    sessions: new Map<string, ChannelSessionState>(),
    reconnectChannels: new Set<string>(),
    joinTimeoutMs: options.channelJoinTimeoutMs ?? defaultChannelJoinTimeoutMs,
  };
  const friendPresence: IrcFriendPresenceState = {
    nicks: [],
    presenceByKey: new Map<string, PresenceStatus>(),
    resolvedNicks: new Set<string>(),
    snapshotByKey: new Map<string, PresenceStatus>(),
    timer: null,
    pendingIsonSnapshot: null,
    nextSnapshotId: 0,
    enabled: true,
    monitorSupported: false,
    monitorLimit: null,
    activeTransport: null,
    registeredMonitorNicks: new Map<string, string>(),
  };
  const channelList: IrcChannelListState = {
    session: { phase: 'idle' },
    timeoutTimer: null,
    timeoutMs: options.channelListTimeoutMs ?? defaultChannelListTimeoutMs,
    drainGraceMs: options.channelListDrainGraceMs ?? defaultChannelListDrainGraceMs,
  };

  return {
    profile,
    handlers,
    lifecycle,
    channels,
    friendPresence,
    channelList,
    replyTracker: new ReplyTracker(),
  };
};
