import type { ChannelUserState } from '../shared/protocol.js';
import { ReplyTracker } from './irc-reply-tracker.js';
import type { IrcConnectionPorts, RuntimeIrcSession } from './irc-port-types.js';
import type {
  ChannelSessionState,
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcFriendPresenceState,
  IrcLifecycleState,
} from './irc-state-types.js';
import type { Handlers, IrcConnectionState } from './irc-types.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

const defaultChannelJoinTimeoutMs = 15_000;
const defaultChannelListTimeoutMs = 60_000;
const defaultChannelListDrainGraceMs = 15_000;

export type IrcConnectionOptions = {
  channelJoinTimeoutMs?: number;
  channelListTimeoutMs?: number;
  channelListDrainGraceMs?: number;
  legacyCompat?: boolean;
};

type DeferredAccess<T> = {
  get(): T;
  set(value: T): void;
};

type IrcConnectionAccess = {
  connection: IrcConnectionState;
  setPorts(value: IrcConnectionPorts): void;
  setRuntimeSession(value: RuntimeIrcSession): void;
};

export const createIrcConnectionAccess = (
  profile: RuntimeNetworkProfile,
  handlers: Handlers,
  options: IrcConnectionOptions = {}
): IrcConnectionAccess => {
  const state = createIrcConnectionState(profile, handlers, options);
  const ports = createDeferredAccess<IrcConnectionPorts>('ports');
  const runtimeSession = createDeferredAccess<RuntimeIrcSession>('runtime session');
  const connection = {
    ...state,
    get ports() {
      return ports.get();
    },
    get runtimeSession() {
      return runtimeSession.get();
    },
  } as IrcConnectionState;

  return {
    connection,
    setPorts(value) {
      ports.set(value);
    },
    setRuntimeSession(value) {
      runtimeSession.set(value);
    },
  };
};

const createIrcConnectionState = (
  profile: RuntimeNetworkProfile,
  handlers: Handlers,
  options: IrcConnectionOptions
) => {
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

const createDeferredAccess = <T>(label: string): DeferredAccess<T> => {
  let value: T | null = null;
  return {
    get() {
      if (value === null) {
        throw new Error(`IRC connection ${label} accessed before initialization`);
      }
      return value;
    },
    set(nextValue) {
      value = nextValue;
    },
  };
};
