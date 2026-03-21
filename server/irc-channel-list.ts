import type { ChannelListEntry } from '../shared/protocol.js';
import { emitChannelListFailed, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import type { IrcConnection } from './irc.js';

const channelListNumerics = new Set(['321', '322', '323', '263', '421', '461']);

export const requestChannelList = (connection: IrcConnection, requestId: string) => {
  connection.prunePendingReplyContexts();
  if (!connection.connected || connection.isChannelListPending()) {
    return false;
  }
  if (!connection.sendRaw('LIST', 'server')) {
    return false;
  }
  startChannelList(connection, 'structured', { requestId });
  return true;
};

export const recordChannelListEntry = (connection: IrcConnection, requestId: string, entry: ChannelListEntry) => {
  if (requestId !== connection.activeChannelListRequestId) {
    return;
  }
  connection.activeChannelListEntries.push(entry);
  resetChannelListTimeout(connection, requestId);
};

export const finishChannelListRequest = (connection: IrcConnection, requestId: string) => {
  if (requestId === connection.activeChannelListRequestId && connection.activeChannelListMode === 'structured') {
    clearActiveChannelList(connection);
  }
  if (requestId === connection.drainingChannelListRequestId && connection.drainingChannelListMode === 'structured') {
    clearDrainingChannelList(connection);
  }
};

export const getChannelListRequestFailureMessage = (connection: IrcConnection) => {
  connection.prunePendingReplyContexts();
  return connection.isChannelListPending()
    ? 'Waiting for the previous channel list response to finish'
    : connection.socket ? 'Still connecting to server' : 'Not connected';
};

export const getActiveChannelListSnapshot = (connection: IrcConnection) => {
  if (connection.activeChannelListMode !== 'structured' || !connection.activeChannelListRequestId) {
    return null;
  }
  return {
    requestId: connection.activeChannelListRequestId,
    entries: [...connection.activeChannelListEntries],
  };
};

export const handleChannelListNumeric = (connection: IrcConnection, command: string, params: string[]) => {
  connection.prunePendingReplyContexts();
  if (!isChannelListNumeric(command, params)) {
    return false;
  }
  const mode = connection.activeChannelListMode ?? connection.drainingChannelListMode;
  if (!mode) {
    return true;
  }
  const isDraining = connection.activeChannelListMode === null;
  if (mode === 'structured') {
    const requestId = (isDraining ? connection.drainingChannelListRequestId : connection.activeChannelListRequestId) ?? null;
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

  const sourceTarget = (isDraining ? connection.drainingChannelListSourceTarget : connection.activeChannelListSourceTarget) ?? 'server';
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
  if (connection.activeChannelListMode) {
    failActiveChannelList(connection, message);
  }
};

export const clearActiveChannelList = (connection: IrcConnection) => {
  if (connection.channelListTimeoutTimer) {
    clearTimeout(connection.channelListTimeoutTimer);
    connection.channelListTimeoutTimer = null;
  }
  connection.activeChannelListMode = null;
  connection.activeChannelListSourceTarget = null;
  connection.activeChannelListRequestId = null;
  connection.activeChannelListEntries = [];
};

export const clearDrainingChannelList = (connection: IrcConnection) => {
  connection.drainingChannelListMode = null;
  connection.drainingChannelListSourceTarget = null;
  connection.drainingChannelListRequestId = null;
  connection.drainingChannelListExpiresAt = null;
};

export const isChannelListPending = (connection: IrcConnection) => {
  connection.prunePendingReplyContexts();
  return connection.activeChannelListMode !== null || connection.drainingChannelListMode !== null;
};

export const startChannelList = (
  connection: IrcConnection,
  mode: 'raw' | 'structured',
  options: { requestId?: string; sourceTarget?: string }
) => {
  clearActiveChannelList(connection);
  connection.activeChannelListMode = mode;
  connection.activeChannelListSourceTarget = mode === 'raw' ? options.sourceTarget ?? 'server' : null;
  connection.activeChannelListRequestId = mode === 'structured' ? options.requestId ?? null : null;
  connection.activeChannelListEntries = [];
  resetChannelListTimeout(connection, connection.activeChannelListRequestId ?? '__raw__');
};

export const failActiveChannelList = (
  connection: IrcConnection,
  message: string,
  options: { emitStructuredFailure?: boolean; sourceTarget?: string } = {}
) => {
  const mode = connection.activeChannelListMode;
  const requestId = connection.activeChannelListRequestId;
  const sourceTarget = options.sourceTarget ?? connection.activeChannelListSourceTarget ?? 'server';
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
  if (connection.channelListTimeoutMs <= 0) {
    return;
  }
  if (connection.channelListTimeoutTimer) {
    clearTimeout(connection.channelListTimeoutTimer);
  }
  const timer = setTimeout(() => {
    if (!connection.activeChannelListMode) {
      return;
    }
    if (connection.activeChannelListMode === 'structured' && connection.activeChannelListRequestId !== requestId) {
      return;
    }
    if (connection.activeChannelListMode === 'raw' && requestId !== '__raw__') {
      return;
    }
    failActiveChannelList(connection, 'Channel list request timed out');
  }, connection.channelListTimeoutMs);
  timer.unref?.();
  connection.channelListTimeoutTimer = timer;
};

const markDrainingChannelList = (
  connection: IrcConnection,
  mode: 'raw' | 'structured',
  requestId: string | null,
  sourceTarget: string
) => {
  clearActiveChannelList(connection);
  connection.drainingChannelListMode = mode;
  connection.drainingChannelListSourceTarget = mode === 'raw' ? sourceTarget : null;
  connection.drainingChannelListRequestId = mode === 'structured' ? requestId : null;
  connection.drainingChannelListExpiresAt = Date.now() + connection.channelListDrainGraceMs;
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
