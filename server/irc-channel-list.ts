import type { ChannelListEntry } from '../shared/protocol.js';
import {
  appendStructuredChannelListEntry,
  clearActiveChannelListSession,
  clearDrainingChannelListSession,
  finishStructuredChannelListSession,
  getActiveStructuredChannelListSnapshot,
  getChannelListSession,
  isChannelListPending as isChannelListStatePending,
  matchesChannelListSession,
  moveActiveChannelListToDraining,
  startChannelListSession,
} from './irc-channel-list-state.js';
import type { IrcChannelListContext } from './irc-contexts.js';
import { emitChannelListCompleted, emitChannelListEntry, emitChannelListFailed, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import type { IrcChannelListMode } from './irc-state-types.js';

const channelListNumerics = new Set(['321', '322', '323', '263', '421', '461']);

export const requestChannelList = (connection: IrcChannelListContext, requestId: string) => {
  connection.ports.reply.prunePendingReplyContexts();
  if (!connection.lifecycle.connected || isChannelListPending(connection)) {
    return false;
  }
  if (!connection.ports.transport.sendRaw('LIST', 'server')) {
    return false;
  }
  startChannelList(connection, 'structured', { requestId });
  return true;
};

export const recordChannelListEntry = (connection: IrcChannelListContext, requestId: string, entry: ChannelListEntry) => {
  const session = appendStructuredChannelListEntry(connection.channelList, requestId, entry);
  if (!session) {
    return;
  }
  resetChannelListTimeout(connection, session);
};

export const finishChannelListRequest = (connection: IrcChannelListContext, requestId: string) => {
  const outcome = finishStructuredChannelListSession(connection.channelList, requestId);
  if (outcome) {
    clearChannelListTimeout(connection);
  }
};

export const getChannelListRequestFailureMessage = (connection: IrcChannelListContext) => {
  connection.ports.reply.prunePendingReplyContexts();
  return isChannelListPending(connection)
    ? 'Waiting for the previous channel list response to finish'
    : connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected';
};

export const getActiveChannelListSnapshot = (connection: IrcChannelListContext) => {
  return getActiveStructuredChannelListSnapshot(connection.channelList);
};

export const handleChannelListNumeric = (connection: IrcChannelListContext, command: string, params: string[]) => {
  connection.ports.reply.prunePendingReplyContexts();
  if (!isChannelListNumeric(command, params)) {
    return false;
  }
  const session = getChannelListSession(connection.channelList);
  if (session.phase === 'idle') {
    return true;
  }
  return session.mode === 'structured'
    ? handleStructuredChannelListNumeric(connection, session, command, params)
    : handleRawChannelListNumeric(connection, session, command, params);
};

export const abortActiveChannelList = (connection: IrcChannelListContext, message: string) => {
  if (getChannelListSession(connection.channelList).phase === 'active') {
    failActiveChannelList(connection, message);
  }
};

export const clearActiveChannelList = (connection: IrcChannelListContext) => {
  clearChannelListTimeout(connection);
  clearActiveChannelListSession(connection.channelList);
};

export const clearDrainingChannelList = (connection: IrcChannelListContext) => {
  clearDrainingChannelListSession(connection.channelList);
};

export const isChannelListPending = (connection: IrcChannelListContext) => {
  connection.ports.reply.prunePendingReplyContexts();
  return isChannelListStatePending(connection.channelList);
};

export const startChannelList = (
  connection: IrcChannelListContext,
  mode: IrcChannelListMode,
  options: { requestId?: string; sourceTarget?: string }
) => {
  clearChannelListTimeout(connection);
  clearDrainingChannelList(connection);
  startChannelListSession(connection.channelList, mode, options);
  const session = getChannelListSession(connection.channelList);
  if (session.phase === 'active') {
    resetChannelListTimeout(connection, session);
  }
};

export const failActiveChannelList = (
  connection: IrcChannelListContext,
  message: string,
  options: { emitStructuredFailure?: boolean; sourceTarget?: string } = {}
) => {
  const session = moveActiveChannelListToDraining(connection.channelList);
  if (!session) {
    return;
  }
  clearChannelListTimeout(connection);
  const sourceTarget = options.sourceTarget ?? session.sourceTarget ?? 'server';
  if (session.mode === 'structured') {
    if (session.requestId && options.emitStructuredFailure !== false) {
      emitChannelListFailed(connection, session.requestId, message);
    }
    return;
  }
  emitStatus(connection, message, 'error', sourceTarget);
};

const resetChannelListTimeout = (
  connection: IrcChannelListContext,
  expectedSession: Extract<ReturnType<typeof getChannelListSession>, { phase: 'active' }>
) => {
  if (connection.channelList.timeoutMs <= 0) {
    return;
  }
  if (connection.channelList.timeoutTimer) {
    clearTimeout(connection.channelList.timeoutTimer);
  }
  const timer = setTimeout(() => {
    const session = getChannelListSession(connection.channelList);
    if (!matchesChannelListSession(expectedSession, session)) {
      return;
    }
    failActiveChannelList(connection, 'Channel list request timed out');
  }, connection.channelList.timeoutMs);
  timer.unref?.();
  connection.channelList.timeoutTimer = timer;
};

const handleStructuredChannelListNumeric = (
  connection: IrcChannelListContext,
  session: Extract<ReturnType<typeof getChannelListSession>, { mode: 'structured' }>,
  command: string,
  params: string[]
) => {
  if (session.requestId === null) {
    return session.phase === 'draining';
  }
  if (command === '321') {
    return true;
  }
  if (command === '322') {
    const entry = parseChannelListEntry(params);
    const activeSession = entry ? appendStructuredChannelListEntry(connection.channelList, session.requestId, entry) : null;
    if (entry && activeSession) {
      resetChannelListTimeout(connection, activeSession);
      emitChannelListEntry(connection, session.requestId, entry);
    }
    return true;
  }
  if (command === '323') {
    const outcome = finishStructuredChannelListSession(connection.channelList, session.requestId);
    if (outcome) {
      clearChannelListTimeout(connection);
    }
    if (outcome === 'completed') {
      emitChannelListCompleted(connection, session.requestId);
    }
    return true;
  }
  if (!isChannelListFailureNumeric(command, params)) {
    return false;
  }
  session.phase === 'draining'
    ? clearDrainingChannelList(connection)
    : failActiveChannelList(connection, formatChannelListFailure(command, params));
  return true;
};

const handleRawChannelListNumeric = (
  connection: IrcChannelListContext,
  session: Extract<ReturnType<typeof getChannelListSession>, { mode: 'raw' }>,
  command: string,
  params: string[]
) => {
  const sourceTarget = session.sourceTarget ?? 'server';
  if (session.phase === 'draining') {
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
    resetChannelListTimeout(connection, session);
  }
  return true;
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

const clearChannelListTimeout = (connection: IrcChannelListContext) => {
  if (!connection.channelList.timeoutTimer) {
    return;
  }
  clearTimeout(connection.channelList.timeoutTimer);
  connection.channelList.timeoutTimer = null;
};
