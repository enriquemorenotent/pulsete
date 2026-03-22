import { emitStatus } from './irc-emit.js';
import { formatPingReply } from './irc-handle-line-helpers.js';
import {
  handleJoin,
  handleKick,
  handleNamesNumeric,
  handleNick,
  handlePart,
  handleQuit,
  handleTopic,
  handleTopicNumeric,
} from './irc-handle-line-channels.js';
import { handleMode } from './irc-handle-line-mode.js';
import { handleTextMessage } from './irc-handle-line-messages.js';
import { handleRegistrationLine } from './irc-handle-line-registration.js';
import { formatServerNumeric, getServerNumericStatusKind } from './irc-server-log.js';
import { nickFromPrefix, parseLine } from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

const channelJoinFailureCommands = new Set(['403', '405', '437', '471', '472', '473', '474', '475', '476', '477']);

export const handleIrcLine = (connection: IrcConnectionState, line: string) => {
  const { prefix, command, params } = parseLine(line);
  const nick = nickFromPrefix(prefix);
  if (command === 'PING') {
    connection.sendRaw(formatPingReply(line, params));
    return;
  }
  if (handleRegistrationLine(connection, command, params, nick)) {
    return;
  }
  const isIsonUnsupported = command === '421' && (params[1] ?? '').toUpperCase() === 'ISON';
  const isonReplyContext = command === '303' || isIsonUnsupported
    ? connection.consumeReplyContext(command, params, nick)
    : null;
  if (command === '303' && isonReplyContext?.kind === 'friend-presence') {
    connection.handleFriendPresence(
      isonReplyContext.pollId,
      (params[1] ?? '').split(/\s+/).map((value) => value.trim()).filter(Boolean)
    );
    return;
  }
  if (isIsonUnsupported) {
    connection.disableFriendPresence();
    if (isonReplyContext?.kind === 'friend-presence') {
      return;
    }
  }
  if (connection.handleChannelListNumeric(command, params)) {
    return;
  }
  if (/^\d{3}$/.test(command)) {
    handleNumericReply(connection, command, params, nick, isonReplyContext);
  }
  if (command === 'PRIVMSG' || command === 'NOTICE') {
    handleTextMessage(connection, command, params, nick);
  } else if (command === 'JOIN') {
    handleJoin(connection, params, nick);
  } else if (command === 'PART') {
    handlePart(connection, params, nick);
  } else if (command === 'KICK') {
    handleKick(connection, params, nick);
  } else if (command === 'QUIT') {
    handleQuit(connection, params, nick);
  } else if (command === 'NICK') {
    handleNick(connection, params, nick);
  } else if (command === 'TOPIC') {
    handleTopic(connection, params, nick);
  } else if (command === 'MODE') {
    handleMode(connection, params);
  } else if (command === '332') {
    handleTopicNumeric(connection, params);
  } else if (command === '353') {
    handleNamesNumeric(connection, params);
  }
};

const handleNumericReply = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null,
  isonReplyContext: ReturnType<IrcConnectionState['consumeReplyContext']>
) => {
  const replyContext = isonReplyContext && 'sourceTarget' in isonReplyContext
    ? isonReplyContext
    : connection.consumeReplyContext(command, params, nick);
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
  for (const lineText of formatServerNumeric(command, params, { allowTopicPayload, allowNamesPayload })) {
    emitStatus(connection, lineText, getServerNumericStatusKind(command), replyTarget ?? undefined, true);
  }
};
