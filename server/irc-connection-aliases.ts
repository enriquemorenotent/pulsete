import type { RuntimeIrcSession } from './irc-port-types.js';
import type {
  IrcChannelListState,
  IrcChannelTrackingState,
  IrcConnectionState,
  IrcFriendPresenceState,
  IrcLifecycleState,
  IrcReplyTracker,
} from './irc-types.js';

type AliasParams = {
  connection: object;
  channelList: IrcChannelListState;
  channels: IrcChannelTrackingState;
  friendPresence: IrcFriendPresenceState;
  lifecycle: IrcLifecycleState;
  replyTracker: IrcReplyTracker;
  runtimeSession: RuntimeIrcSession;
  state: () => IrcConnectionState['state'];
};

const readonlyAlias = <T>(get: () => T) => ({ enumerable: true, get });
const mutableAlias = <T>(get: () => T, set: (value: T) => void) => ({ enumerable: true, get, set });

export const defineIrcConnectionAliases = ({
  connection,
  channelList,
  channels,
  friendPresence,
  lifecycle,
  replyTracker,
  runtimeSession,
  state,
}: AliasParams) => {
  Object.defineProperties(connection, {
    state: readonlyAlias(state),
    socket: mutableAlias(
      () => lifecycle.socket,
      (value) => {
        lifecycle.socket = value;
      }
    ),
    buffer: mutableAlias(
      () => lifecycle.buffer,
      (value) => {
        lifecycle.buffer = value;
      }
    ),
    channelUsers: readonlyAlias(() => channels.users),
    channelSessions: readonlyAlias(() => channels.sessions),
    connectDeadlineTimer: mutableAlias(
      () => lifecycle.connectDeadlineTimer,
      (value) => {
        lifecycle.connectDeadlineTimer = value;
      }
    ),
    friendNicks: mutableAlias(
      () => friendPresence.nicks,
      (value) => {
        friendPresence.nicks = value;
      }
    ),
    onlineFriendKeys: mutableAlias(
      () => friendPresence.onlineKeys,
      (value) => {
        friendPresence.onlineKeys = value;
      }
    ),
    friendPresenceTimer: mutableAlias(
      () => friendPresence.timer,
      (value) => {
        friendPresence.timer = value;
      }
    ),
    pendingFriendPresencePoll: mutableAlias(
      () => friendPresence.pendingPoll,
      (value) => {
        friendPresence.pendingPoll = value;
      }
    ),
    nextFriendPresencePollId: mutableAlias(
      () => friendPresence.nextPollId,
      (value) => {
        friendPresence.nextPollId = value;
      }
    ),
    friendPresenceEnabled: mutableAlias(
      () => friendPresence.enabled,
      (value) => {
        friendPresence.enabled = value;
      }
    ),
    manualDisconnect: mutableAlias(
      () => lifecycle.manualDisconnect,
      (value) => {
        lifecycle.manualDisconnect = value;
      }
    ),
    reconnectAttempts: mutableAlias(
      () => lifecycle.reconnectAttempts,
      (value) => {
        lifecycle.reconnectAttempts = value;
      }
    ),
    reconnectTimer: mutableAlias(
      () => lifecycle.reconnectTimer,
      (value) => {
        lifecycle.reconnectTimer = value;
      }
    ),
    connected: mutableAlias(
      () => lifecycle.connected,
      (value) => {
        lifecycle.connected = value;
      }
    ),
    serverName: mutableAlias(
      () => lifecycle.serverName,
      (value) => {
        lifecycle.serverName = value;
      }
    ),
    currentNick: mutableAlias(
      () => lifecycle.currentNick,
      (value) => {
        lifecycle.currentNick = value;
      }
    ),
    activeChannelListMode: mutableAlias(
      () => channelList.active.mode,
      (value) => {
        channelList.active.mode = value;
      }
    ),
    activeChannelListSourceTarget: mutableAlias(
      () => channelList.active.sourceTarget,
      (value) => {
        channelList.active.sourceTarget = value;
      }
    ),
    activeChannelListRequestId: mutableAlias(
      () => channelList.active.requestId,
      (value) => {
        channelList.active.requestId = value;
      }
    ),
    activeChannelListEntries: mutableAlias(
      () => channelList.active.entries,
      (value) => {
        channelList.active.entries = value;
      }
    ),
    drainingChannelListMode: mutableAlias(
      () => channelList.draining.mode,
      (value) => {
        channelList.draining.mode = value;
      }
    ),
    drainingChannelListSourceTarget: mutableAlias(
      () => channelList.draining.sourceTarget,
      (value) => {
        channelList.draining.sourceTarget = value;
      }
    ),
    drainingChannelListRequestId: mutableAlias(
      () => channelList.draining.requestId,
      (value) => {
        channelList.draining.requestId = value;
      }
    ),
    lastFailureMessage: mutableAlias(
      () => lifecycle.lastFailureMessage,
      (value) => {
        lifecycle.lastFailureMessage = value;
      }
    ),
    channelJoinTimeoutMs: readonlyAlias(() => channels.joinTimeoutMs),
    channelListTimeoutTimer: mutableAlias(
      () => channelList.timeoutTimer,
      (value) => {
        channelList.timeoutTimer = value;
      }
    ),
    drainingChannelListExpiresAt: mutableAlias(
      () => channelList.draining.expiresAt,
      (value) => {
        channelList.draining.expiresAt = value;
      }
    ),
    channelListTimeoutMs: readonlyAlias(() => channelList.timeoutMs),
    channelListDrainGraceMs: readonlyAlias(() => channelList.drainGraceMs),
    pendingNick: mutableAlias(
      () => replyTracker.pendingNick,
      (value) => {
        replyTracker.setPendingNick(value);
      }
    ),
    pendingReplyContexts: readonlyAlias(() => replyTracker.pendingReplyContexts),
    runtimeSession: { enumerable: true, value: runtimeSession },
  });
};
