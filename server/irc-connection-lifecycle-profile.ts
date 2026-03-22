import { connectSocket } from './irc-connect.js';
import { resolveProfileUpdateStrategy } from './irc-connection-lifecycle-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { emitState, emitStatus } from './irc-emit.js';
import { createNickReplyContext } from './irc-reply-context.js';
import { consumePendingNickReplyContexts } from './irc-reply-state.js';
import { applyOfflineTransition } from './irc-connection-lifecycle-transitions.js';
import type { RuntimeNetworkProfile } from './storage-types.js';

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
    connection.queueReplyContext(createNickReplyContext(options.replyTarget, fallbackNick));
  }
};

export const confirmNick = (connection: IrcLifecycleContext, newNick: string) => {
  consumePendingNickReplyContexts(connection, newNick);
  connection.lifecycle.currentNick = newNick;
  emitState(connection);
};

export const reconnectWithUpdatedProfile = (connection: IrcConnectContext) => {
  const socket = connection.lifecycle.socket;
  applyOfflineTransition(connection, {
    manualDisconnect: false,
    reconnectAttempts: 0,
    clearPendingNick: true,
  });
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

export const updateProfile = (connection: IrcConnectContext, profile: RuntimeNetworkProfile) => {
  const lifecycle = connection.lifecycle;
  const strategy = resolveProfileUpdateStrategy(connection, profile);
  if (strategy === 'restart-connecting-socket') {
    const socket = lifecycle.socket;
    applyOfflineTransition(connection, {
      manualDisconnect: false,
      reconnectAttempts: lifecycle.reconnectAttempts,
    });
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
    connection.setNick(profile.nick);
  }
};
