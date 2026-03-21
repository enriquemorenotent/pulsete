import { abortActiveChannelList, clearDrainingChannelList } from './irc-channel-list.js';
import { clearChannelSessions } from './irc-channel-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { clearFriendPresenceTimer, updateOnlineFriendKeys } from './irc-friend-presence.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type IrcProfileUpdateStrategy =
  | 'restart-connecting-socket'
  | 'reconnect-active-session'
  | 'update-live-nick'
  | 'none';

export const resetRuntimeSessionState = (connection: IrcLifecycleContext) => {
  connection.lifecycle.buffer = '';
  clearChannelSessions(connection);
  abortActiveChannelList(connection, 'Channel list request was interrupted');
  clearDrainingChannelList(connection);
  connection.replyTracker.reset();
  connection.friendPresence.pendingPoll = null;
  clearFriendPresenceTimer(connection);
  updateOnlineFriendKeys(connection, []);
};

export const applyOfflineLifecycleState = (connection: IrcLifecycleContext) => {
  connection.lifecycle.connected = false;
  connection.lifecycle.serverName = null;
  connection.lifecycle.currentNick = connection.profile.nick;
  connection.lifecycle.lastFailureMessage = null;
};

export const resolveProfileUpdateStrategy = (
  connection: IrcConnectContext,
  nextProfile: RuntimeNetworkProfile
): IrcProfileUpdateStrategy => {
  const { lifecycle, profile, replyTracker } = connection;
  const reconnectPending = !lifecycle.connected && lifecycle.socket !== null;
  if (reconnectPending && requiresConnectingReconnect(profile, nextProfile)) {
    return 'restart-connecting-socket';
  }
  if (lifecycle.connected && requiresSessionReconnect(profile, nextProfile)) {
    return 'reconnect-active-session';
  }
  if (
    lifecycle.connected
    && !isSameIrcIdentifier(replyTracker.pendingNick ?? lifecycle.currentNick, nextProfile.nick)
  ) {
    return 'update-live-nick';
  }
  return 'none';
};

const requiresSocketRestart = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  current.host !== next.host || current.port !== next.port || current.tls !== next.tls;

const requiresConnectingReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  current.nick !== next.nick || requiresSessionReconnect(current, next);

const requiresSessionReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) =>
  requiresSocketRestart(current, next)
  || current.password !== next.password
  || current.username !== next.username
  || getReportedRealName(current) !== getReportedRealName(next);

const getReportedRealName = (profile: RuntimeNetworkProfile) => profile.realName || profile.name;
