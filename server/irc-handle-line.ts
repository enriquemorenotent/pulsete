import { emitSendFailure, emitStatus } from './irc-emit.js';
import { formatPingReply, isSelfNick } from './irc-handle-line-helpers.js';
import {
  handleAccount,
  handleAway,
  handleChghost,
  handleJoin,
  handleKick,
  handleNamesNumeric,
  handleSetname,
  handleWhoNumeric,
  handleNick,
  handlePart,
  handleQuit,
  handleTopic,
  handleTopicNumeric,
} from './irc-handle-line-channels.js';
import { handleMode } from './irc-handle-line-mode.js';
import { handleTextMessage } from './irc-handle-line-messages.js';
import { handleRegistrationLine } from './irc-handle-line-registration.js';
import { hasNegotiatedCapability } from './irc-capabilities.js';
import { formatServerNumeric, getServerNumericStatusKind } from './irc-server-log.js';
import { formatStandardReply, getStandardReplyStatusKind, isStandardReplyCommand } from './irc-standard-replies.js';
import { nickFromPrefix, parseLine } from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

const channelJoinFailureCommands = new Set(['403', '405', '437', '471', '472', '473', '474', '475', '476', '477']);

export const handleIrcLine = (connection: IrcConnectionState, line: string) => {
  const { tags, prefix, command, params } = parseLine(line);
  const nick = nickFromPrefix(prefix);
  const replyLabel = resolveReplyLabel(connection, tags);
  if (command === 'PING') {
    connection.sendRaw(formatPingReply(line, params));
    return;
  }
  if (command === 'BATCH' && handleBatchCommand(connection, params, tags.label ?? null)) {
    return;
  }
  if (handleRegistrationLine(connection, command, params, nick)) {
    return;
  }
  const sourceIsUser = !!prefix?.includes('!');
  const isIsonUnsupported = command === '421' && (params[1] ?? '').toUpperCase() === 'ISON';
  const isonReplyContext = command === '303' || isIsonUnsupported
    ? connection.consumeReplyContext(command, params, nick, undefined, replyLabel)
    : null;
  if (isonReplyContext?.kind === 'friend-presence-ison') {
    connection.handleFriendPresenceIsonReply(
      isonReplyContext.snapshotId,
      command === '303' ? parseIsonReplyNicks(params) : null,
      isIsonUnsupported,
    );
    return;
  }
  if (
    (command === '730' || command === '731')
    && connection.handleFriendPresenceMonitorUpdate(
      parseMonitorReplyNicks(params),
      command === '730' ? 'online' : 'offline',
    )
  ) {
    return;
  }
  if (connection.handleChannelListNumeric(command, params)) {
    return;
  }
  if (isStandardReplyCommand(command)) {
    handleStandardReply(connection, command, params, nick, replyLabel);
    return;
  }
  if (/^\d{3}$/.test(command)) {
    handleNumericReply(connection, command, params, nick, isonReplyContext, replyLabel);
  }
  if (command === 'PRIVMSG' || command === 'NOTICE' || command === 'TAGMSG') {
    handleTextMessage(connection, command, params, nick, sourceIsUser, prefix, tags, replyLabel);
  } else if (command === 'JOIN') {
    handleJoin(connection, params, prefix);
  } else if (command === 'PART') {
    handlePart(connection, params, nick);
  } else if (command === 'KICK') {
    handleKick(connection, params, nick);
  } else if (command === 'QUIT') {
    handleQuit(connection, params, nick);
  } else if (command === 'NICK') {
    handleNick(connection, params, nick);
  } else if (command === 'ACCOUNT') {
    handleAccount(connection, params, nick);
  } else if (command === 'AWAY') {
    handleAway(connection, params, nick);
  } else if (command === 'CHGHOST') {
    handleChghost(connection, params, nick);
  } else if (command === 'SETNAME') {
    handleSetname(connection, params, nick);
  } else if (command === 'TOPIC') {
    handleTopic(connection, params, nick);
  } else if (command === 'INVITE') {
    handleInvite(connection, params, nick);
  } else if (command === 'MODE') {
    handleMode(connection, params);
  } else if (command === '352') {
    handleWhoNumeric(connection, params);
  } else if (command === '332') {
    handleTopicNumeric(connection, params);
  } else if (command === '353') {
    handleNamesNumeric(connection, params);
  } else if (command === '366') {
    const channel = connection.resolveTrackedChannel(params[1] ?? '');
    if (channel && !hasNegotiatedCapability(connection.lifecycle.capabilities, 'away-notify')) {
      connection.sendRaw(`WHO ${channel}`);
    }
  }
};

const handleInvite = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const invitedNick = params[0] ?? null;
  const channel = params[1] ?? '';
  if (!channel || !isSelfNick(connection, invitedNick)) {
    return;
  }
  emitStatus(connection, `${nick ?? 'Someone'} invited you to ${channel}`, 'notice');
};

const parseIsonReplyNicks = (params: string[]) =>
  (params.at(-1) ?? '')
    .split(/\s+/)
    .map((nick) => nick.trim())
    .filter(Boolean);

const parseMonitorReplyNicks = (params: string[]) =>
  (params.at(-1) ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split('!')[0] ?? entry)
    .filter(Boolean);

const handleNumericReply = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null,
  isonReplyContext: ReturnType<IrcConnectionState['consumeReplyContext']>,
  replyLabel: string | null
) => {
  const replyContext = isonReplyContext && 'sourceTarget' in isonReplyContext
    ? isonReplyContext
    : connection.consumeReplyContext(command, params, nick, undefined, replyLabel);
  let replyTarget = replyContext && 'sourceTarget' in replyContext ? replyContext.sourceTarget : null;
  const joinFailureChannel = channelJoinFailureCommands.has(command) ? params[1] ?? '' : '';
  if (joinFailureChannel) {
    const session = connection.getChannelSession(joinFailureChannel);
    if (session?.phase === 'joining') {
      replyTarget ??= session.sourceTarget;
      connection.removeChannelSession(joinFailureChannel);
    }
  }
  const allowTopicPayload = replyContext?.kind === 'channel' && replyContext.operation === 'topic-query';
  const allowNamesPayload = replyContext?.kind === 'channel' && replyContext.operation === 'names';
  const isMessageSendFailure = replyContext?.kind === 'message' && getServerNumericStatusKind(command) === 'error';
  for (const lineText of formatServerNumeric(command, params, { allowTopicPayload, allowNamesPayload })) {
    if (isMessageSendFailure) {
      emitSendFailure(connection, {
        sourceTarget: replyContext.sourceTarget,
        target: replyContext.target,
        message: lineText,
        rollbackMessageId: replyContext.optimisticMessageId,
      });
      continue;
    }
    emitStatus(connection, lineText, getServerNumericStatusKind(command), replyTarget ?? undefined, true);
  }
};

const handleStandardReply = (
  connection: IrcConnectionState,
  command: 'FAIL' | 'WARN' | 'NOTE',
  params: string[],
  nick: string | null,
  replyLabel: string | null,
) => {
  const replyContext = connection.consumeReplyContext(command, params, nick, undefined, replyLabel);
  const replyTarget = replyContext && 'sourceTarget' in replyContext ? replyContext.sourceTarget : undefined;
  const isMessageSendFailure = replyContext?.kind === 'message' && command === 'FAIL';
  for (const lineText of formatStandardReply(command, params)) {
    if (isMessageSendFailure && replyContext) {
      emitSendFailure(connection, {
        sourceTarget: replyContext.sourceTarget,
        target: replyContext.target,
        message: lineText,
        rollbackMessageId: replyContext.optimisticMessageId,
      });
      continue;
    }
    emitStatus(connection, lineText, getStandardReplyStatusKind(command), replyTarget, true);
  }
};

const handleBatchCommand = (
  connection: IrcConnectionState,
  params: string[],
  label: string | null,
) => {
  const token = params[0] ?? '';
  if (!token) {
    return false;
  }
  const isStart = token.startsWith('+');
  const isEnd = token.startsWith('-');
  const batchId = token.slice(1);
  if (!batchId) {
    return false;
  }
  if (isStart) {
    if ((params[1] ?? '') === 'labeled-response' && label) {
      connection.lifecycle.capabilities.batchLabelById.set(batchId, label);
    }
    return true;
  }
  if (isEnd) {
    connection.lifecycle.capabilities.batchLabelById.delete(batchId);
    return true;
  }
  return false;
};

const resolveReplyLabel = (connection: IrcConnectionState, tags: Record<string, string | null>) => {
  const directLabel = tags.label;
  if (directLabel) {
    return directLabel;
  }
  const batchId = tags.batch;
  return batchId ? connection.lifecycle.capabilities.batchLabelById.get(batchId) ?? null : null;
};
