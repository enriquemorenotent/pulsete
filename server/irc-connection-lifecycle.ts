import { connectSocket } from './irc-connect.js';
import {
  applyOfflineLifecycleState,
  resetRuntimeSessionState,
  resolveProfileUpdateStrategy,
} from './irc-connection-lifecycle-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { emitState, emitStatus } from './irc-emit.js';
import { createNickReplyContext } from './irc-reply-context.js';
import { consumePendingNickReplyContexts, discardPendingNickReplyContexts } from './irc-reply-state.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

export const openSocket = (
  connection: IrcLifecycleContext,
  socket: NonNullable<IrcLifecycleContext['lifecycle']['socket']>
) => {
  if (connection.lifecycle.socket === socket) {
    return;
  }
  clearReconnectTimer(connection);
  connection.lifecycle.manualDisconnect = false;
  connection.lifecycle.lastFailureMessage = null;
  connection.lifecycle.socket = socket;
  emitState(connection);
};

export const beginLogin = (connection: IrcLifecycleContext) => {
  connection.lifecycle.lastFailureMessage = null;
};

export const setConnectDeadlineTimer = (connection: IrcLifecycleContext, timer: ReturnType<typeof setTimeout>) => {
  clearConnectDeadlineTimer(connection);
  connection.lifecycle.connectDeadlineTimer = timer;
};

export const markConnectionFailure = (connection: IrcLifecycleContext, detail: string) => {
  connection.lifecycle.lastFailureMessage = formatConnectionFailure(connection, detail);
  emitStatus(connection, connection.lifecycle.lastFailureMessage, 'error');
};

export const handleSocketClosed = (
  connection: IrcLifecycleContext,
  socket: NonNullable<IrcLifecycleContext['lifecycle']['socket']>
) => {
  const lifecycle = connection.lifecycle;
  if (lifecycle.socket !== socket) {
    return;
  }
  clearConnectDeadlineTimer(connection);
  clearReconnectTimer(connection);
  const wasConnected = lifecycle.connected;
  const failureMessage = lifecycle.lastFailureMessage;
  lifecycle.socket = null;
  resetTransientState(connection);
  applyOfflineLifecycleState(connection);
  emitState(connection);
  if (wasConnected) {
    emitStatus(connection, 'Disconnected from server');
  } else if (!failureMessage) {
    emitStatus(connection, formatConnectionFailure(connection, 'Connection closed'), 'error');
  }
  scheduleReconnect(connection);
};

export const markRegistered = (connection: IrcLifecycleContext, serverName: string | null, nick: string | null) => {
  const lifecycle = connection.lifecycle;
  lifecycle.connected = true;
  clearConnectDeadlineTimer(connection);
  lifecycle.serverName = serverName ?? connection.profile.host;
  lifecycle.reconnectAttempts = 0;
  lifecycle.currentNick = nick ?? connection.profile.nick;
  discardPendingNickReplyContexts(connection);
  emitState(connection);
};

export const clearPendingNick = (connection: IrcLifecycleContext) => {
  connection.replyTracker.clearPendingNick();
};

export const applyNickFallback = (
  connection: IrcLifecycleContext,
  fallbackNick: string,
  options: { replyTarget?: string; updatePending: boolean }
) => {
  if (options.updatePending) {
    connection.replyTracker.setPendingNick(fallbackNick);
  } else {
    connection.lifecycle.currentNick = fallbackNick;
  }
  if (options.replyTarget) {
    connection.ports.reply.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
  }
};

export const confirmNick = (connection: IrcLifecycleContext, newNick: string) => {
  consumePendingNickReplyContexts(connection, newNick);
  connection.lifecycle.currentNick = newNick;
  emitState(connection);
};

export const connect = (connection: IrcConnectContext, resetRetryBudget = true) => {
  clearReconnectTimer(connection);
  if (resetRetryBudget) {
    connection.lifecycle.reconnectAttempts = 0;
  }
  connection.friendPresence.enabled = true;
  connection.lifecycle.lastFailureMessage = null;
  connectSocket(connection);
};

export const disconnect = (connection: IrcLifecycleContext, raw = 'QUIT :Client disconnecting') => {
  const lifecycle = connection.lifecycle;
  lifecycle.manualDisconnect = true;
  lifecycle.reconnectAttempts = 0;
  clearConnectDeadlineTimer(connection);
  clearReconnectTimer(connection);
  const socket = lifecycle.socket;
  if (socket) {
    connection.ports.transport.sendRaw(raw);
    socket.end();
    lifecycle.socket = null;
  }
  const wasActive = lifecycle.connected || socket !== null || lifecycle.serverName !== null;
  resetTransientState(connection);
  applyOfflineLifecycleState(connection);
  if (wasActive) {
    emitState(connection);
    emitStatus(connection, 'Disconnected from server');
  }
};

export const updateProfile = (connection: IrcConnectContext, profile: RuntimeNetworkProfile) => {
  const lifecycle = connection.lifecycle;
  const strategy = resolveProfileUpdateStrategy(connection, profile);
  if (strategy === 'restart-connecting-socket') {
    const socket = lifecycle.socket;
    lifecycle.socket = null;
    resetTransientState(connection);
    socket?.destroy();
  }
  connection.profile = profile;
  if (!lifecycle.connected) {
    lifecycle.currentNick = profile.nick;
  }
  if (strategy === 'restart-connecting-socket') {
    connectSocket(connection);
  } else if (strategy === 'reconnect-active-session') {
    reconnectWithUpdatedProfile(connection);
  } else if (strategy === 'update-live-nick') {
    connection.ports.command.setNick(profile.nick);
  }
};

export const clearReconnectTimer = (connection: IrcLifecycleContext) => {
  const reconnectTimer = connection.lifecycle.reconnectTimer;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    connection.lifecycle.reconnectTimer = null;
  }
};

export const clearConnectDeadlineTimer = (connection: IrcLifecycleContext) => {
  const deadlineTimer = connection.lifecycle.connectDeadlineTimer;
  if (deadlineTimer) {
    clearTimeout(deadlineTimer);
    connection.lifecycle.connectDeadlineTimer = null;
  }
};

export const resetTransientState = (connection: IrcLifecycleContext) => {
  clearConnectDeadlineTimer(connection);
  resetRuntimeSessionState(connection);
};

export const reconnectWithUpdatedProfile = (connection: IrcConnectContext) => {
  const lifecycle = connection.lifecycle;
  const socket = lifecycle.socket;
  clearReconnectTimer(connection);
  lifecycle.reconnectAttempts = 0;
  lifecycle.socket = null;
  resetTransientState(connection);
  applyOfflineLifecycleState(connection);
  connection.replyTracker.setPendingNick(null);
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

export const scheduleReconnect = (connection: IrcLifecycleContext) => {
  const lifecycle = connection.lifecycle;
  if (lifecycle.manualDisconnect || lifecycle.reconnectAttempts >= 3) {
    return;
  }
  const attempt = ++lifecycle.reconnectAttempts;
  const timer = setTimeout(() => {
    lifecycle.reconnectTimer = null;
    if (lifecycle.socket || lifecycle.manualDisconnect || attempt !== lifecycle.reconnectAttempts) {
      return;
    }
    emitStatus(connection, `Reconnecting (${attempt}/3)`, 'notice');
    connection.ports.lifecycle.connect(false);
  }, 3000 * attempt);
  timer.unref?.();
  lifecycle.reconnectTimer = timer;
};

export const formatConnectionFailure = (connection: IrcLifecycleContext, detail: string) =>
  `Unable to connect to ${connection.profile.host}:${connection.profile.port} (${detail})`;
