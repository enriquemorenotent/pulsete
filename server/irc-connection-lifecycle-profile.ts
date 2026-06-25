import { connectSocket } from './irc-connect.js';
import {
  resolveProfileNickSyncTarget,
  resolveProfileUpdateStrategy,
} from './irc-connection-lifecycle-state.js';
import type { IrcConnectContext, IrcLifecycleContext } from './irc-contexts.js';
import { emitState, emitStatus } from './irc-emit.js';
import { isSameIrcIdentifier } from './irc-parser.js';
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
  if (
    connection.lifecycle.profileNickSyncTarget
    && isSameIrcIdentifier(connection.lifecycle.profileNickSyncTarget, newNick)
  ) {
    connection.lifecycle.profileNickSyncTarget = null;
  }
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
  const profileNickSyncTarget = resolveProfileNickSyncTarget(connection, profile);
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
  lifecycle.profileNickSyncTarget = profileNickSyncTarget;
  if (!lifecycle.connected) {
    lifecycle.currentNick = profile.nick;
    lifecycle.profileNickSyncTarget = null;
  }
  if (
    lifecycle.profileNickSyncTarget
    && !connection.replyTracker.pendingNick
    && isSameIrcIdentifier(lifecycle.currentNick, lifecycle.profileNickSyncTarget)
  ) {
    lifecycle.profileNickSyncTarget = null;
  }
  if (strategy === 'restart-connecting-socket') {
    connectSocket(connection);
  } else if (strategy === 'reconnect-active-session') {
    reconnectWithUpdatedProfile(connection);
  } else if (strategy === 'update-live-nick') {
    connection.setNick(profile.nick);
  }
};
