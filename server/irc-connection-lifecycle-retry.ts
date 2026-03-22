import type { IrcLifecycleContext } from './irc-contexts.js';
import { emitStatus } from './irc-emit.js';

export const setConnectDeadlineTimer = (connection: IrcLifecycleContext, timer: ReturnType<typeof setTimeout>) => {
  clearConnectDeadlineTimer(connection);
  connection.lifecycle.connectDeadlineTimer = timer;
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
    connection.connect(false);
  }, 3000 * attempt);
  timer.unref?.();
  lifecycle.reconnectTimer = timer;
};
