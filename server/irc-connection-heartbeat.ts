import { emitStatus } from './irc-emit.js';
import type { IrcLifecycleContext } from './irc-contexts.js';
import type { IrcHeartbeatState, IrcSocket } from './irc-state-types.js';

const defaultHeartbeatIdleMs = 120_000;
const defaultHeartbeatTimeoutMs = 30_000;

type IrcHeartbeatOptions = {
  idleMs?: number;
  timeoutMs?: number;
};

export const createIrcHeartbeatState = (options: IrcHeartbeatOptions = {}): IrcHeartbeatState => ({
  timer: null,
  awaitingActivity: false,
  idleMs: resolveDuration(options.idleMs, process.env.PULSETE_IRC_HEARTBEAT_IDLE_MS, defaultHeartbeatIdleMs),
  timeoutMs: resolveDuration(
    options.timeoutMs,
    process.env.PULSETE_IRC_HEARTBEAT_TIMEOUT_MS,
    defaultHeartbeatTimeoutMs
  ),
});

export const clearIrcHeartbeat = (connection: IrcLifecycleContext) => {
  const heartbeat = connection.lifecycle.heartbeat;
  if (heartbeat.timer) {
    clearTimeout(heartbeat.timer);
    heartbeat.timer = null;
  }
  heartbeat.awaitingActivity = false;
};

export const startIrcHeartbeat = (connection: IrcLifecycleContext) => {
  connection.lifecycle.heartbeat.awaitingActivity = false;
  scheduleIdleProbe(connection);
};

export const recordIrcHeartbeatActivity = (connection: IrcLifecycleContext) => {
  if (!connection.lifecycle.connected) {
    return;
  }
  connection.lifecycle.heartbeat.awaitingActivity = false;
  scheduleIdleProbe(connection);
};

export const enableIrcSocketKeepAlive = (socket: IrcSocket, idleMs: number) => {
  socket.setKeepAlive(true, idleMs);
};

const scheduleIdleProbe = (connection: IrcLifecycleContext) => {
  const { heartbeat, socket, connected } = connection.lifecycle;
  clearIrcHeartbeat(connection);
  if (!connected || !socket) {
    return;
  }
  heartbeat.timer = setTimeout(() => sendHeartbeatProbe(connection, socket), heartbeat.idleMs);
  heartbeat.timer.unref?.();
};

const sendHeartbeatProbe = (connection: IrcLifecycleContext, socket: IrcSocket) => {
  const { heartbeat } = connection.lifecycle;
  if (connection.lifecycle.socket !== socket || !connection.lifecycle.connected) {
    return;
  }
  heartbeat.awaitingActivity = true;
  try {
    socket.write(`PING :pulsete-${Date.now().toString(36)}\r\n`);
  } catch (error) {
    failHeartbeat(connection, socket, `Connection heartbeat failed (${formatError(error)})`);
    return;
  }
  heartbeat.timer = setTimeout(() => {
    if (
      connection.lifecycle.socket === socket
      && connection.lifecycle.connected
      && connection.lifecycle.heartbeat.awaitingActivity
    ) {
      failHeartbeat(connection, socket, 'Connection heartbeat timed out');
    }
  }, heartbeat.timeoutMs);
  heartbeat.timer.unref?.();
};

const failHeartbeat = (connection: IrcLifecycleContext, socket: IrcSocket, message: string) => {
  clearIrcHeartbeat(connection);
  connection.lifecycle.lastFailureMessage = message;
  emitStatus(connection, message, 'error');
  if (connection.lifecycle.socket === socket) {
    socket.destroy();
  }
};

const resolveDuration = (option: number | undefined, envValue: string | undefined, fallback: number) => {
  const parsed = Number(option ?? envValue ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const formatError = (error: unknown) => error instanceof Error ? error.message : String(error);
