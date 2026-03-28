import { abortActiveChannelList, clearDrainingChannelList } from './irc-channel-list.js';
import { createIdleSaslState } from './irc-auth.js';
import { clearChannelSessions } from './irc-channel-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import {
  clearFriendPresenceTimer,
  updateFriendPresenceStatuses,
} from './irc-friend-presence.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import {
  resolveNetworkAuthAccount,
  resolveNetworkAuthMethod,
  resolveNetworkAuthTarget,
} from '../shared/network-model.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export type IrcProfileUpdateStrategy =
  | 'restart-connecting-socket'
  | 'reconnect-active-session'
  | 'update-live-nick'
  | 'none';

export const resetRuntimeSessionState = (connection: IrcLifecycleContext) => {
  connection.lifecycle.buffer = '';
  connection.lifecycle.sasl = createIdleSaslState();
  connection.lifecycle.pendingNickservAutoJoinTarget = null;
  clearChannelSessions(connection);
  abortActiveChannelList(connection, 'Channel list request was interrupted');
  clearDrainingChannelList(connection);
  connection.replyTracker.reset();
  connection.friendPresence.pendingIsonSnapshot = null;
  connection.friendPresence.nextSnapshotId = 0;
  connection.friendPresence.monitorSupported = false;
  connection.friendPresence.monitorLimit = null;
  connection.friendPresence.activeTransport = null;
  connection.friendPresence.registeredMonitorNicks.clear();
  connection.friendPresence.resolvedNicks.clear();
  connection.friendPresence.snapshotByKey.clear();
  clearFriendPresenceTimer(connection);
  updateFriendPresenceStatuses(connection, new Map());
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
  || requiresAuthPasswordReconnect(current, next)
  || resolveNetworkAuthMethod(current) !== resolveNetworkAuthMethod(next)
  || requiresAuthAccountReconnect(current, next)
  || requiresAuthTargetReconnect(current, next)
  || current.username !== next.username
  || getReportedRealName(current) !== getReportedRealName(next);

const getReportedRealName = (profile: RuntimeNetworkProfile) => profile.realName || profile.name;

const requiresAuthTargetReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) => {
  const currentMethod = resolveNetworkAuthMethod(current);
  const nextMethod = resolveNetworkAuthMethod(next);
  if (currentMethod !== 'nickserv' && nextMethod !== 'nickserv') {
    return false;
  }
  return resolveNetworkAuthTarget(current.authTarget) !== resolveNetworkAuthTarget(next.authTarget);
};

const requiresAuthPasswordReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) => {
  const currentMethod = resolveNetworkAuthMethod(current);
  const nextMethod = resolveNetworkAuthMethod(next);
  if (currentMethod === 'none' && nextMethod === 'none') {
    return false;
  }
  return current.password !== next.password;
};

const requiresAuthAccountReconnect = (current: RuntimeNetworkProfile, next: RuntimeNetworkProfile) => {
  const currentMethod = resolveNetworkAuthMethod(current);
  const nextMethod = resolveNetworkAuthMethod(next);
  const currentUsesAuthAccount = currentMethod === 'nickserv' || currentMethod === 'sasl-plain';
  const nextUsesAuthAccount = nextMethod === 'nickserv' || nextMethod === 'sasl-plain';
  if (!currentUsesAuthAccount && !nextUsesAuthAccount) {
    return false;
  }
  return resolveNetworkAuthAccount(current) !== resolveNetworkAuthAccount(next);
};
