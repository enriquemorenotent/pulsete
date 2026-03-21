import type { IrcConnectionState } from './irc-types.js';
import type { RuntimeIrcSession } from './irc-port-types.js';

const readonlyAlias = <T>(get: () => T) => ({ enumerable: true, get });
const mutableAlias = <T>(get: () => T, set: (value: T) => void) => ({ enumerable: true, get, set });

export const createLegacyIrcConnectionPropertyDescriptors = (
  connection: IrcConnectionState & { runtimeSession: RuntimeIrcSession }
) => ({
  state: readonlyAlias(() => connection.runtimeSession.lifecycle.state),
  socket: mutableAlias(
    () => connection.lifecycle.socket,
    (value) => {
      connection.lifecycle.socket = value;
    }
  ),
  buffer: mutableAlias(
    () => connection.lifecycle.buffer,
    (value) => {
      connection.lifecycle.buffer = value;
    }
  ),
  channelUsers: readonlyAlias(() => connection.channels.users),
  channelSessions: readonlyAlias(() => connection.channels.sessions),
  connectDeadlineTimer: mutableAlias(
    () => connection.lifecycle.connectDeadlineTimer,
    (value) => {
      connection.lifecycle.connectDeadlineTimer = value;
    }
  ),
  friendNicks: mutableAlias(
    () => connection.friendPresence.nicks,
    (value) => {
      connection.friendPresence.nicks = value;
    }
  ),
  onlineFriendKeys: mutableAlias(
    () => connection.friendPresence.onlineKeys,
    (value) => {
      connection.friendPresence.onlineKeys = value;
    }
  ),
  friendPresenceTimer: mutableAlias(
    () => connection.friendPresence.timer,
    (value) => {
      connection.friendPresence.timer = value;
    }
  ),
  pendingFriendPresencePoll: mutableAlias(
    () => connection.friendPresence.pendingPoll,
    (value) => {
      connection.friendPresence.pendingPoll = value;
    }
  ),
  nextFriendPresencePollId: mutableAlias(
    () => connection.friendPresence.nextPollId,
    (value) => {
      connection.friendPresence.nextPollId = value;
    }
  ),
  friendPresenceEnabled: mutableAlias(
    () => connection.friendPresence.enabled,
    (value) => {
      connection.friendPresence.enabled = value;
    }
  ),
  manualDisconnect: mutableAlias(
    () => connection.lifecycle.manualDisconnect,
    (value) => {
      connection.lifecycle.manualDisconnect = value;
    }
  ),
  reconnectAttempts: mutableAlias(
    () => connection.lifecycle.reconnectAttempts,
    (value) => {
      connection.lifecycle.reconnectAttempts = value;
    }
  ),
  reconnectTimer: mutableAlias(
    () => connection.lifecycle.reconnectTimer,
    (value) => {
      connection.lifecycle.reconnectTimer = value;
    }
  ),
  connected: mutableAlias(
    () => connection.lifecycle.connected,
    (value) => {
      connection.lifecycle.connected = value;
    }
  ),
  serverName: mutableAlias(
    () => connection.lifecycle.serverName,
    (value) => {
      connection.lifecycle.serverName = value;
    }
  ),
  currentNick: mutableAlias(
    () => connection.lifecycle.currentNick,
    (value) => {
      connection.lifecycle.currentNick = value;
    }
  ),
  activeChannelListMode: mutableAlias(
    () => connection.channelList.active.mode,
    (value) => {
      connection.channelList.active.mode = value;
    }
  ),
  activeChannelListSourceTarget: mutableAlias(
    () => connection.channelList.active.sourceTarget,
    (value) => {
      connection.channelList.active.sourceTarget = value;
    }
  ),
  activeChannelListRequestId: mutableAlias(
    () => connection.channelList.active.requestId,
    (value) => {
      connection.channelList.active.requestId = value;
    }
  ),
  activeChannelListEntries: mutableAlias(
    () => connection.channelList.active.entries,
    (value) => {
      connection.channelList.active.entries = value;
    }
  ),
  drainingChannelListMode: mutableAlias(
    () => connection.channelList.draining.mode,
    (value) => {
      connection.channelList.draining.mode = value;
    }
  ),
  drainingChannelListSourceTarget: mutableAlias(
    () => connection.channelList.draining.sourceTarget,
    (value) => {
      connection.channelList.draining.sourceTarget = value;
    }
  ),
  drainingChannelListRequestId: mutableAlias(
    () => connection.channelList.draining.requestId,
    (value) => {
      connection.channelList.draining.requestId = value;
    }
  ),
  lastFailureMessage: mutableAlias(
    () => connection.lifecycle.lastFailureMessage,
    (value) => {
      connection.lifecycle.lastFailureMessage = value;
    }
  ),
  channelJoinTimeoutMs: readonlyAlias(() => connection.channels.joinTimeoutMs),
  channelListTimeoutTimer: mutableAlias(
    () => connection.channelList.timeoutTimer,
    (value) => {
      connection.channelList.timeoutTimer = value;
    }
  ),
  drainingChannelListExpiresAt: mutableAlias(
    () => connection.channelList.draining.expiresAt,
    (value) => {
      connection.channelList.draining.expiresAt = value;
    }
  ),
  channelListTimeoutMs: readonlyAlias(() => connection.channelList.timeoutMs),
  channelListDrainGraceMs: readonlyAlias(() => connection.channelList.drainGraceMs),
  pendingNick: mutableAlias(
    () => connection.replyTracker.pendingNick,
    (value) => {
      connection.replyTracker.setPendingNick(value);
    }
  ),
  pendingReplyContexts: readonlyAlias(() => connection.replyTracker.pendingReplyContexts),
});
