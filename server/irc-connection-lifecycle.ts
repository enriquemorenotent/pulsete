import { connectSocket } from './irc-connect.js';
import { createLoginSaslState, resolveDeferredNickservAutoJoinTarget } from './irc-auth.js';
import {
  clearConnectDeadlineTimer,
  clearReconnectTimer,
  scheduleReconnect,
} from './irc-connection-lifecycle-retry.js';
import {
  applyOfflineTransition,
  applyOpenedSocketTransition,
  applyRegisteredTransition,
  formatConnectionFailure,
  prepareConnectAttempt,
} from './irc-connection-lifecycle-transitions.js';
import { resetRuntimeSessionState } from './irc-connection-lifecycle-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { emitState, emitStatus } from './irc-emit.js';
import { discardPendingNickReplyContexts } from './irc-reply-state.js';

export {
  clearConnectDeadlineTimer,
  clearReconnectTimer,
  setConnectDeadlineTimer,
} from './irc-connection-lifecycle-retry.js';
export {
  applyNickFallback,
  clearPendingNick,
  confirmNick,
  updateProfile,
} from './irc-connection-lifecycle-profile.js';

export const openSocket = (
  connection: IrcLifecycleContext,
  socket: NonNullable<IrcLifecycleContext['lifecycle']['socket']>
) => {
  if (connection.lifecycle.socket === socket) {
    return;
  }
  applyOpenedSocketTransition(connection, socket);
  emitState(connection);
};

export const beginLogin = (connection: IrcLifecycleContext) => {
  connection.lifecycle.lastFailureMessage = null;
  connection.lifecycle.sasl = createLoginSaslState(connection.profile);
  connection.lifecycle.pendingNickservAutoJoinTarget = resolveDeferredNickservAutoJoinTarget(connection.profile);
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
  const wasConnected = lifecycle.connected;
  const failureMessage = lifecycle.lastFailureMessage;
  applyOfflineTransition(connection, {
    manualDisconnect: false,
    reconnectAttempts: lifecycle.reconnectAttempts,
  });
  emitState(connection);
  if (wasConnected) {
    emitStatus(connection, 'Disconnected from server');
  } else if (!failureMessage) {
    emitStatus(connection, formatConnectionFailure(connection, 'Connection closed'), 'error');
  }
  scheduleReconnect(connection);
};

export const markRegistered = (connection: IrcLifecycleContext, serverName: string | null, nick: string | null) => {
  applyRegisteredTransition(connection, serverName, nick);
  discardPendingNickReplyContexts(connection);
  emitState(connection);
};

export const connect = (connection: IrcConnectContext, resetRetryBudget = true) => {
  prepareConnectAttempt(connection, resetRetryBudget);
  connectSocket(connection);
};

export const disconnect = (connection: IrcLifecycleContext, raw = 'QUIT :Client disconnecting') => {
  const lifecycle = connection.lifecycle;
  const socket = lifecycle.socket;
  if (socket) {
    clearConnectDeadlineTimer(connection);
    clearReconnectTimer(connection);
    connection.sendRaw(raw);
    socket.end();
  }
  const wasActive = lifecycle.connected || socket !== null || lifecycle.serverName !== null;
  applyOfflineTransition(connection, {
    manualDisconnect: true,
    reconnectAttempts: 0,
  });
  if (wasActive) {
    emitState(connection);
    emitStatus(connection, 'Disconnected from server');
  }
};

export const dispose = (connection: IrcLifecycleContext) => {
  const socket = connection.lifecycle.socket;
  applyOfflineTransition(connection, {
    manualDisconnect: true,
    reconnectAttempts: 0,
  });
  socket?.destroy();
};

export const resetTransientState = (connection: IrcLifecycleContext) => {
  clearConnectDeadlineTimer(connection);
  resetRuntimeSessionState(connection);
};
