import {
  applyOfflineLifecycleState,
  resetRuntimeSessionState,
} from './irc-connection-lifecycle-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { clearConnectDeadlineTimer, clearReconnectTimer } from './irc-connection-lifecycle-retry.js';
import { clearIrcHeartbeat } from './irc-connection-heartbeat.js';

export const formatConnectionFailure = (connection: IrcLifecycleContext, detail: string) =>
  `Unable to connect to ${connection.profile.host}:${connection.profile.port} (${detail})`;

export const prepareConnectAttempt = (connection: IrcConnectContext, resetRetryBudget: boolean) => {
  clearReconnectTimer(connection);
  clearIrcHeartbeat(connection);
  connection.lifecycle.manualDisconnect = false;
  if (resetRetryBudget) {
    connection.lifecycle.reconnectAttempts = 0;
  }
  connection.friendPresence.enabled = true;
  connection.lifecycle.lastFailureMessage = null;
};

export const applyOpenedSocketTransition = (
  connection: IrcLifecycleContext,
  socket: NonNullable<IrcLifecycleContext['lifecycle']['socket']>
) => {
  clearReconnectTimer(connection);
  clearIrcHeartbeat(connection);
  connection.lifecycle.manualDisconnect = false;
  connection.lifecycle.lastFailureMessage = null;
  connection.lifecycle.socket = socket;
};

export const applyRegisteredTransition = (
  connection: IrcLifecycleContext,
  serverName: string | null,
  nick: string | null
) => {
  const lifecycle = connection.lifecycle;
  lifecycle.connected = true;
  clearConnectDeadlineTimer(connection);
  lifecycle.serverName = serverName ?? connection.profile.host;
  lifecycle.reconnectAttempts = 0;
  lifecycle.currentNick = nick ?? connection.profile.nick;
};

export const applyOfflineTransition = (
  connection: IrcLifecycleContext,
  options: {
    manualDisconnect: boolean;
    reconnectAttempts: number;
    clearPendingNick?: boolean;
  }
) => {
  clearConnectDeadlineTimer(connection);
  clearReconnectTimer(connection);
  clearIrcHeartbeat(connection);
  connection.lifecycle.socket = null;
  resetRuntimeSessionState(connection);
  applyOfflineLifecycleState(connection);
  connection.lifecycle.manualDisconnect = options.manualDisconnect;
  connection.lifecycle.reconnectAttempts = options.reconnectAttempts;
  if (options.clearPendingNick) {
    connection.replyTracker.setPendingNick(null);
  }
};
