import { connectSocket } from './irc-connect.js';
import { emitState, emitStatus } from './irc-emit.js';
import { abortActiveChannelList, clearDrainingChannelList } from './irc-channel-list.js';
import { clearChannelSessions } from './irc-channel-state.js';
import { clearFriendPresenceTimer, updateOnlineFriendKeys } from './irc-friend-presence.js';
import { createNickReplyContext } from './irc-reply-context.js';
import { consumePendingNickReplyContexts, discardPendingNickReplyContexts } from './irc-reply-state.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import type { RuntimeNetworkProfile } from './storage-types.js';
import type { IrcConnection } from './irc.js';

export const openSocket = (connection: IrcConnection, socket: IrcConnection['socket']) => {
  if (connection.socket === socket) {
    return;
  }
  clearReconnectTimer(connection);
  connection.manualDisconnect = false;
  connection.lastFailureMessage = null;
  connection.socket = socket;
  emitState(connection);
};

export const beginLogin = (connection: IrcConnection) => {
  connection.lastFailureMessage = null;
};

export const setConnectDeadlineTimer = (connection: IrcConnection, timer: ReturnType<typeof setTimeout>) => {
  clearConnectDeadlineTimer(connection);
  connection.connectDeadlineTimer = timer;
};

export const markConnectionFailure = (connection: IrcConnection, detail: string) => {
  connection.lastFailureMessage = formatConnectionFailure(connection, detail);
  emitStatus(connection, connection.lastFailureMessage, 'error');
};

export const handleSocketClosed = (connection: IrcConnection, socket: NonNullable<IrcConnection['socket']>) => {
  if (connection.socket !== socket) {
    return;
  }
  clearConnectDeadlineTimer(connection);
  clearReconnectTimer(connection);
  const wasConnected = connection.connected;
  const failureMessage = connection.lastFailureMessage;
  connection.socket = null;
  resetTransientState(connection);
  connection.connected = false;
  connection.serverName = null;
  connection.currentNick = connection.profile.nick;
  connection.lastFailureMessage = null;
  emitState(connection);
  if (wasConnected) {
    emitStatus(connection, 'Disconnected from server');
  } else if (!failureMessage) {
    emitStatus(connection, formatConnectionFailure(connection, 'Connection closed'), 'error');
  }
  scheduleReconnect(connection);
};

export const markRegistered = (connection: IrcConnection, serverName: string | null, nick: string | null) => {
  connection.connected = true;
  clearConnectDeadlineTimer(connection);
  connection.serverName = serverName ?? connection.profile.host;
  connection.reconnectAttempts = 0;
  connection.currentNick = nick ?? connection.profile.nick;
  discardPendingNickReplyContexts(connection);
  emitState(connection);
};

export const clearPendingNick = (connection: IrcConnection) => {
  connection.replyTracker.clearPendingNick();
};

export const applyNickFallback = (
  connection: IrcConnection,
  fallbackNick: string,
  options: { replyTarget?: string; updatePending: boolean }
) => {
  if (options.updatePending) {
    connection.pendingNick = fallbackNick;
  } else {
    connection.currentNick = fallbackNick;
  }
  if (options.replyTarget) {
    connection.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
  }
};

export const confirmNick = (connection: IrcConnection, newNick: string) => {
  consumePendingNickReplyContexts(connection, newNick);
  connection.currentNick = newNick;
  emitState(connection);
};

export const connect = (connection: IrcConnection, resetRetryBudget = true) => {
  clearReconnectTimer(connection);
  if (resetRetryBudget) {
    connection.reconnectAttempts = 0;
  }
  connection.friendPresenceEnabled = true;
  connection.lastFailureMessage = null;
  connectSocket(connection);
};

export const disconnect = (connection: IrcConnection, raw = 'QUIT :Client disconnecting') => {
  connection.manualDisconnect = true;
  connection.reconnectAttempts = 0;
  clearConnectDeadlineTimer(connection);
  clearReconnectTimer(connection);
  const socket = connection.socket;
  if (socket) {
    connection.sendRaw(raw);
    socket.end();
    connection.socket = null;
  }
  const wasActive = connection.connected || socket !== null || connection.serverName !== null;
  resetTransientState(connection);
  connection.connected = false;
  connection.serverName = null;
  connection.currentNick = connection.profile.nick;
  connection.lastFailureMessage = null;
  if (wasActive) {
    emitState(connection);
    emitStatus(connection, 'Disconnected from server');
  }
};

export const updateProfile = (connection: IrcConnection, profile: RuntimeNetworkProfile) => {
  const reconnectPending = !connection.connected && connection.socket !== null;
  const restartConnectingSocket = reconnectPending && requiresConnectingReconnect(connection.profile, profile);
  const reconnectActiveSession = connection.connected && requiresSessionReconnect(connection.profile, profile);
  const applyNickUpdate = connection.connected
    && !reconnectActiveSession
    && !isSameIrcIdentifier(connection.pendingNick ?? connection.currentNick, profile.nick);
  if (restartConnectingSocket) {
    const socket = connection.socket;
    connection.socket = null;
    resetTransientState(connection);
    socket?.destroy();
  }
  connection.profile = profile;
  if (!connection.connected) {
    connection.currentNick = profile.nick;
  }
  if (restartConnectingSocket) {
    connectSocket(connection);
  } else if (reconnectActiveSession) {
    reconnectWithUpdatedProfile(connection);
  } else if (applyNickUpdate) {
    connection.setNick(profile.nick);
  }
};

export const clearReconnectTimer = (connection: IrcConnection) => {
  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer);
    connection.reconnectTimer = null;
  }
};

export const clearConnectDeadlineTimer = (connection: IrcConnection) => {
  if (connection.connectDeadlineTimer) {
    clearTimeout(connection.connectDeadlineTimer);
    connection.connectDeadlineTimer = null;
  }
};

export const resetTransientState = (connection: IrcConnection) => {
  connection.buffer = '';
  clearChannelSessions(connection);
  abortActiveChannelList(connection, 'Channel list request was interrupted');
  clearDrainingChannelList(connection);
  connection.replyTracker.reset();
  connection.pendingFriendPresencePoll = null;
  clearConnectDeadlineTimer(connection);
  clearFriendPresenceTimer(connection);
  updateOnlineFriendKeys(connection, []);
};

export const reconnectWithUpdatedProfile = (connection: IrcConnection) => {
  const socket = connection.socket;
  clearReconnectTimer(connection);
  connection.reconnectAttempts = 0;
  connection.socket = null;
  resetTransientState(connection);
  connection.connected = false;
  connection.serverName = null;
  connection.currentNick = connection.profile.nick;
  connection.pendingNick = null;
  connection.lastFailureMessage = null;
  emitState(connection);
  emitStatus(connection, 'Reconnecting to apply updated network settings', 'notice');
  try {
    socket?.write('QUIT :Reconnecting with updated settings\r\n');
  } catch {
    // Ignore write failures while replacing the socket.
  }
  socket?.end();
  connectSocket(connection);
};

export const scheduleReconnect = (connection: IrcConnection) => {
  if (connection.manualDisconnect || connection.reconnectAttempts >= 3) {
    return;
  }
  const attempt = ++connection.reconnectAttempts;
  const timer = setTimeout(() => {
    connection.reconnectTimer = null;
    if (connection.socket || connection.manualDisconnect || attempt !== connection.reconnectAttempts) {
      return;
    }
    emitStatus(connection, `Reconnecting (${attempt}/3)`, 'notice');
    connection.connect(false);
  }, 3000 * attempt);
  timer.unref?.();
  connection.reconnectTimer = timer;
};

export const formatConnectionFailure = (connection: IrcConnection, detail: string) =>
  `Unable to connect to ${connection.profile.host}:${connection.profile.port} (${detail})`;

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
