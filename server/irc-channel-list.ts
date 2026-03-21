import type { ChannelListEntry } from '../shared/protocol.js';
import {
  clearActiveChannelListSession,
  clearDrainingChannelListSession,
  getChannelListSession,
  matchesChannelListSession,
  setActiveChannelListSession,
  setDrainingChannelListSession,
} from './irc-channel-list-session.js';
import type { IrcChannelListContext } from './irc-contexts.js';
import { emitChannelListCompleted, emitChannelListEntry, emitChannelListFailed, emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';

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
  const session = getChannelListSession(connection.channelList);
  if (session.phase !== 'active' || session.mode !== 'structured' || requestId !== session.requestId) {
    return;
  }
  session.entries.push(entry);
  resetChannelListTimeout(connection, session);
};

export const finishChannelListRequest = (connection: IrcChannelListContext, requestId: string) => {
  const session = getChannelListSession(connection.channelList);
  if (session.phase === 'active' && session.mode === 'structured' && requestId === session.requestId) {
    clearActiveChannelList(connection);
  } else if (session.phase === 'draining' && session.mode === 'structured' && requestId === session.requestId) {
    clearDrainingChannelList(connection);
  }
};

export const getChannelListRequestFailureMessage = (connection: IrcChannelListContext) => {
  connection.ports.reply.prunePendingReplyContexts();
  return isChannelListPending(connection)
    ? 'Waiting for the previous channel list response to finish'
    : connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected';
};

export const getActiveChannelListSnapshot = (connection: IrcChannelListContext) => {
  const session = getChannelListSession(connection.channelList);
  if (session.phase !== 'active' || session.mode !== 'structured' || !session.requestId) {
    return null;
  }
  return {
    requestId: session.requestId,
    entries: [...session.entries],
  };
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
  if (session.mode === 'structured') {
    if (session.requestId === null) {
      return session.phase === 'draining';
    }
    if (command === '321') {
      return true;
    }
    if (command === '322') {
      const entry = parseChannelListEntry(params);
      if (entry && session.phase === 'active') {
        recordChannelListEntry(connection, session.requestId, entry);
        emitChannelListEntry(connection, session.requestId, entry);
      }
      return true;
    }
    if (command === '323') {
      if (session.phase === 'draining') {
        clearDrainingChannelList(connection);
      } else {
        clearActiveChannelList(connection);
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
  }

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

export const abortActiveChannelList = (connection: IrcChannelListContext, message: string) => {
  if (getChannelListSession(connection.channelList).phase === 'active') {
    failActiveChannelList(connection, message);
  }
};

export const clearActiveChannelList = (connection: IrcChannelListContext) => {
  if (connection.channelList.timeoutTimer) {
    clearTimeout(connection.channelList.timeoutTimer);
    connection.channelList.timeoutTimer = null;
  }
  clearActiveChannelListSession(connection.channelList);
};

export const clearDrainingChannelList = (connection: IrcChannelListContext) => {
  clearDrainingChannelListSession(connection.channelList);
};

export const isChannelListPending = (connection: IrcChannelListContext) => {
  connection.ports.reply.prunePendingReplyContexts();
  return getChannelListSession(connection.channelList).phase !== 'idle';
};

export const startChannelList = (
  connection: IrcChannelListContext,
  mode: 'raw' | 'structured',
  options: { requestId?: string; sourceTarget?: string }
) => {
  clearActiveChannelList(connection);
  clearDrainingChannelList(connection);
  setActiveChannelListSession(connection.channelList, mode, options);
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
  const session = getChannelListSession(connection.channelList);
  if (session.phase !== 'active') {
    return;
  }
  const sourceTarget = options.sourceTarget ?? session.sourceTarget ?? 'server';
  markDrainingChannelList(connection, session);
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

const markDrainingChannelList = (
  connection: IrcChannelListContext,
  session: Extract<ReturnType<typeof getChannelListSession>, { phase: 'active' }>
) => {
  clearActiveChannelList(connection);
  setDrainingChannelListSession(connection.channelList, session);
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
