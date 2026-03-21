import type { ChannelListEntry } from '../shared/protocol.js';
import { emitChannelListFailed, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import type { IrcConnection } from './irc.js';

const channelListNumerics = new Set(['321', '322', '323', '263', '421', '461']);

export const requestChannelList = (connection: IrcConnection, requestId: string) => {
  connection.prunePendingReplyContexts();
  if (!connection.lifecycle.connected || connection.isChannelListPending()) {
    return false;
  }
  if (!connection.sendRaw('LIST', 'server')) {
    return false;
  }
  startChannelList(connection, 'structured', { requestId });
  return true;
};

export const recordChannelListEntry = (connection: IrcConnection, requestId: string, entry: ChannelListEntry) => {
  if (requestId !== connection.channelList.active.requestId) {
    return;
  }
  connection.channelList.active.entries.push(entry);
  resetChannelListTimeout(connection, requestId);
};

export const finishChannelListRequest = (connection: IrcConnection, requestId: string) => {
  if (requestId === connection.channelList.active.requestId && connection.channelList.active.mode === 'structured') {
    clearActiveChannelList(connection);
  }
  if (requestId === connection.channelList.draining.requestId && connection.channelList.draining.mode === 'structured') {
    clearDrainingChannelList(connection);
  }
};

export const getChannelListRequestFailureMessage = (connection: IrcConnection) => {
  connection.prunePendingReplyContexts();
  return connection.isChannelListPending()
    ? 'Waiting for the previous channel list response to finish'
    : connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected';
};

export const getActiveChannelListSnapshot = (connection: IrcConnection) => {
  const active = connection.channelList.active;
  if (active.mode !== 'structured' || !active.requestId) {
    return null;
  }
  return {
    requestId: active.requestId,
    entries: [...active.entries],
  };
};

export const handleChannelListNumeric = (connection: IrcConnection, command: string, params: string[]) => {
  connection.prunePendingReplyContexts();
  if (!isChannelListNumeric(command, params)) {
    return false;
  }
  const { active, draining } = connection.channelList;
  const mode = active.mode ?? draining.mode;
  if (!mode) {
    return true;
  }
  const isDraining = active.mode === null;
  if (mode === 'structured') {
    const requestId = (isDraining ? draining.requestId : active.requestId) ?? null;
    if (!requestId) {
      return false;
    }
    if (command === '321') {
      return true;
    }
    if (command === '322') {
      const entry = parseChannelListEntry(params);
      if (entry && !isDraining) {
        recordChannelListEntry(connection, requestId, entry);
        connection.handlers.onEvent({ type: 'channel-list-entry', networkId: connection.profile.id, requestId, entry });
      }
      return true;
    }
    if (command === '323') {
      if (isDraining) {
        clearDrainingChannelList(connection);
      } else {
        clearActiveChannelList(connection);
        connection.handlers.onEvent({ type: 'channel-list-completed', networkId: connection.profile.id, requestId });
      }
      return true;
    }
    if (!isChannelListFailureNumeric(command, params)) {
      return false;
    }
    isDraining
      ? clearDrainingChannelList(connection)
      : failActiveChannelList(connection, formatChannelListFailure(command, params));
    return true;
  }

  const sourceTarget = (isDraining ? draining.sourceTarget : active.sourceTarget) ?? 'server';
  if (isDraining) {
    if (command === '323' || isChannelListFailureNumeric(command, params)) {
      clearDrainingChannelList(connection);
    }
    return true;
  }
  for (const line of formatChannelListReply(command, params)) {
    emitStatus(connection, line, 'system', sourceTarget);
  }
  if (command === '323') {
    clearActiveChannelList(connection);
  } else if (isChannelListFailureNumeric(command, params)) {
    failActiveChannelList(connection, formatChannelListFailure(command, params), {
      emitStructuredFailure: false,
      sourceTarget,
    });
  } else {
    resetChannelListTimeout(connection, '__raw__');
  }
  return true;
};

export const abortActiveChannelList = (connection: IrcConnection, message: string) => {
  if (connection.channelList.active.mode) {
    failActiveChannelList(connection, message);
  }
};

export const clearActiveChannelList = (connection: IrcConnection) => {
  if (connection.channelList.timeoutTimer) {
    clearTimeout(connection.channelList.timeoutTimer);
    connection.channelList.timeoutTimer = null;
  }
  connection.channelList.active.mode = null;
  connection.channelList.active.sourceTarget = null;
  connection.channelList.active.requestId = null;
  connection.channelList.active.entries = [];
};

export const clearDrainingChannelList = (connection: IrcConnection) => {
  connection.channelList.draining.mode = null;
  connection.channelList.draining.sourceTarget = null;
  connection.channelList.draining.requestId = null;
  connection.channelList.draining.expiresAt = null;
};

export const isChannelListPending = (connection: IrcConnection) => {
  connection.prunePendingReplyContexts();
  return connection.channelList.active.mode !== null || connection.channelList.draining.mode !== null;
};

export const startChannelList = (
  connection: IrcConnection,
  mode: 'raw' | 'structured',
  options: { requestId?: string; sourceTarget?: string }
) => {
  clearActiveChannelList(connection);
  connection.channelList.active.mode = mode;
  connection.channelList.active.sourceTarget = mode === 'raw' ? options.sourceTarget ?? 'server' : null;
  connection.channelList.active.requestId = mode === 'structured' ? options.requestId ?? null : null;
  connection.channelList.active.entries = [];
  resetChannelListTimeout(connection, connection.channelList.active.requestId ?? '__raw__');
};

export const failActiveChannelList = (
  connection: IrcConnection,
  message: string,
  options: { emitStructuredFailure?: boolean; sourceTarget?: string } = {}
) => {
  const { active } = connection.channelList;
  const mode = active.mode;
  const requestId = active.requestId;
  const sourceTarget = options.sourceTarget ?? active.sourceTarget ?? 'server';
  if (!mode) {
    return;
  }
  markDrainingChannelList(connection, mode, requestId, sourceTarget);
  if (mode === 'structured') {
    if (requestId && options.emitStructuredFailure !== false) {
      emitChannelListFailed(connection, requestId, message);
    }
    return;
  }
  emitStatus(connection, message, 'error', sourceTarget);
};

const resetChannelListTimeout = (connection: IrcConnection, requestId: string) => {
  if (connection.channelList.timeoutMs <= 0) {
    return;
  }
  if (connection.channelList.timeoutTimer) {
    clearTimeout(connection.channelList.timeoutTimer);
  }
  const timer = setTimeout(() => {
    const active = connection.channelList.active;
    if (!active.mode) {
      return;
    }
    if (active.mode === 'structured' && active.requestId !== requestId) {
      return;
    }
    if (active.mode === 'raw' && requestId !== '__raw__') {
      return;
    }
    failActiveChannelList(connection, 'Channel list request timed out');
  }, connection.channelList.timeoutMs);
  timer.unref?.();
  connection.channelList.timeoutTimer = timer;
};

const markDrainingChannelList = (
  connection: IrcConnection,
  mode: 'raw' | 'structured',
  requestId: string | null,
  sourceTarget: string
) => {
  clearActiveChannelList(connection);
  connection.channelList.draining.mode = mode;
  connection.channelList.draining.sourceTarget = mode === 'raw' ? sourceTarget : null;
  connection.channelList.draining.requestId = mode === 'structured' ? requestId : null;
  connection.channelList.draining.expiresAt = Date.now() + connection.channelList.drainGraceMs;
};

const isChannelListNumeric = (command: string, params: string[]) =>
  command === '321'
  || command === '322'
  || command === '323'
  || isChannelListFailureNumeric(command, params);

const isChannelListFailureNumeric = (command: string, params: string[]) =>
  command === '263'
  || ((command === '421' || command === '461') && (params[1] ?? '').toUpperCase() === 'LIST');

const parseChannelListEntry = (params: string[]) => {
  const name = params[1] ?? '';
  if (!name) {
    return null;
  }
  const parsedUsers = Number.parseInt(params[2] ?? '0', 10);
  return { name, users: Number.isFinite(parsedUsers) && parsedUsers >= 0 ? parsedUsers : 0, topic: params[3] ?? '' };
};

const formatChannelListFailure = (command: string, params: string[]) =>
  formatServerNumeric(command, params).at(0)?.replace(/^\* /, '') ?? 'Failed to load the channel list';

const formatChannelListReply = (command: string, params: string[]) =>
  channelListNumerics.has(command) ? formatServerNumeric(command, params) : [];
