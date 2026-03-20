import { randomUUID } from 'node:crypto';
import tls from 'node:tls';
import type { MessageInput } from './storage.js';
import {
  emitChannel,
  emitMessage,
  emitState,
  emitStatus,
} from './irc-emit.js';
import { createNickReplyContext, getLatestPendingNick, type PendingReplyContext } from './irc-reply-context.js';
import { formatServerNumeric, getServerNumericStatusKind } from './irc-server-log.js';
import { isServiceNick } from './irc-services.js';
import {
  removeChannelUser,
  renameChannelUser,
  updateChannelUserMode,
  upsertChannelUser,
} from '../shared/channel-users.js';
import {
  findIrcCaseMatch,
  isChannelTarget,
  isSameIrcIdentifier,
  nickFromPrefix,
  parseChannelUserToken,
  parseLine,
  stripCtcp,
} from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

const nickRejectionCommands = new Set(['431', '432', '436', '437']);
const channelModeArgumentTokens = new Set(['b', 'e', 'I', 'k']);
const channelModeSetOnlyArgumentTokens = new Set(['L', 'f', 'j', 'l']);
const channelJoinFailureCommands = new Set(['403', '405', '437', '471', '472', '473', '474', '475', '476', '477']);

export const handleIrcLine = (connection: IrcConnectionState, line: string) => {
  const { prefix, command, params } = parseLine(line);
  const nick = nickFromPrefix(prefix);
  if (command === 'PING') {
    connection.sendRaw(formatPingReply(line, params));
    return;
  }
  if (
    handleWelcome(connection, command, params, nick)
    || handleNickConflict(connection, command, params, nick)
    || handleNickRejected(connection, command, params, nick)
  ) {
    return;
  }
  const isIsonUnsupported = command === '421' && (params[1] ?? '').toUpperCase() === 'ISON';
  const isonReplyContext = command === '303' || isIsonUnsupported
    ? connection.consumeReplyContext(command, params, nick)
    : null;
  if (command === '303' && isonReplyContext?.kind === 'friend-presence') {
    const onlineNicks = (params[1] ?? '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    connection.handleFriendPresence(isonReplyContext.pollId, onlineNicks);
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
    const replyContext = isonReplyContext && 'sourceTarget' in isonReplyContext
      ? isonReplyContext
      : connection.consumeReplyContext(command, params, nick);
    let replyTarget = replyContext && 'sourceTarget' in replyContext
      ? replyContext.sourceTarget
      : null;
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
      emitStatus(
        connection,
        lineText,
        getServerNumericStatusKind(command),
        replyTarget ?? undefined,
        true
      );
    }
  }
  if (command === 'PRIVMSG' || command === 'NOTICE') {
    handleTextMessage(connection, command, params, nick);
    return;
  }
  if (command === 'JOIN') {
    handleJoin(connection, params, nick);
    return;
  }
  if (command === 'PART') {
    handlePart(connection, params, nick);
    return;
  }
  if (command === 'KICK') {
    handleKick(connection, params, nick);
    return;
  }
  if (command === 'QUIT') {
    handleQuit(connection, params, nick);
    return;
  }
  if (command === 'NICK') {
    handleNick(connection, params, nick);
    return;
  }
  if (command === 'TOPIC') {
    handleTopic(connection, params, nick);
    return;
  }
  if (command === 'MODE') {
    handleMode(connection, params);
    return;
  }
  if (command === '332') {
    const channel = resolveTrackedChannel(connection, params[1] ?? '');
    if (channel) {
      emitChannel(connection, channel, { topic: params[2] ?? '' });
    }
    return;
  }
  if (command === '353') {
    const channel = resolveTrackedChannel(connection, params[2] ?? '');
    if (channel) {
      let knownUsers = connection.channelUsers.get(channel) ?? [];
      for (const name of (params[3] ?? '').split(' ')) {
        const user = parseChannelUserToken(name);
        if (user) {
          knownUsers = upsertChannelUser(knownUsers, user);
        }
      }
      connection.channelUsers.set(channel, knownUsers);
      emitChannel(connection, channel, { users: knownUsers });
    }
    return;
  }
};

const handleWelcome = (connection: IrcConnectionState, command: string, params: string[], nick: string | null) => {
  if (command !== '001') {
    return false;
  }
  connection.connected = true;
  connection.clearConnectDeadlineTimer();
  connection.serverName = nick ?? connection.profile.host;
  connection.reconnectAttempts = 0;
  connection.currentNick = params[0] ?? connection.profile.nick;
  discardPendingNickReplyContexts(connection);
  connection.pendingNick = null;
  emitState(connection);
  for (const line of formatServerNumeric(command, params)) {
    emitStatus(connection, line);
  }
  emitStatus(
    connection,
    connection.socket instanceof tls.TLSSocket
      ? `* Connected securely via ${connection.socket.getProtocol() ?? 'TLS'} ${connection.socket.getCipher().standardName ?? connection.socket.getCipher().name}`
      : '* Connected via TCP'
  );
  connection.refreshFriendPresence();
  for (const channel of connection.profile.autoJoin) {
    connection.join(channel);
  }
  return true;
};

const handleNickConflict = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null
) => {
  if (command !== '433') {
    return false;
  }
  const replyContext = connection.consumeReplyContext(command, params, nick);
  if (connection.connected && !replyContext && !connection.pendingNick) {
    return true;
  }
  const attemptedNick = replyContext?.kind === 'nick'
    ? replyContext.requestedNick
    : connection.pendingNick ?? connection.currentNick;
  const replyTarget = replyContext && 'sourceTarget' in replyContext
    ? replyContext.sourceTarget
    : undefined;
  if (
    replyContext?.kind === 'nick'
    && connection.pendingNick
    && !isSameIrcIdentifier(connection.pendingNick, attemptedNick)
  ) {
    emitStatus(
      connection,
      `${attemptedNick} is already in use. Keeping ${connection.pendingNick} as the pending nick.`,
      'notice',
      replyTarget,
      true
    );
    return true;
  }
  const fallbackNick = getNextNickOnConflict(connection, attemptedNick);
  const shouldUpdatePendingNick = replyContext?.kind === 'nick' || !!connection.pendingNick;
  if (!connection.sendRaw(`NICK ${fallbackNick}`)) {
    return true;
  }
  if (shouldUpdatePendingNick) {
    connection.pendingNick = fallbackNick;
  } else {
    connection.currentNick = fallbackNick;
  }
  if (replyTarget) {
    connection.queueReplyContext(createNickReplyContext(replyTarget, fallbackNick));
  }
  emitStatus(
    connection,
    `${attemptedNick} is already in use. Retrying with ${fallbackNick}...`,
    'notice',
    replyTarget,
    true
  );
  return true;
};

const handleNickRejected = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null
) => {
  if (
    !nickRejectionCommands.has(command)
    || command === '433'
    || (command === '437' && isChannelTarget(params[1] ?? ''))
  ) {
    return false;
  }
  const replyContext = connection.consumeReplyContext(command, params, nick);
  const rejectedNick = replyContext?.kind === 'nick'
    ? replyContext.requestedNick
    : connection.pendingNick;
  if (!rejectedNick) {
    return false;
  }
  const replyTarget = replyContext && 'sourceTarget' in replyContext
    ? replyContext.sourceTarget
    : undefined;
  if (!replyContext) {
    connection.pendingNick = null;
  }
  emitStatus(
    connection,
    `${rejectedNick} was rejected by the server`,
    'error',
    replyTarget,
    true
  );
  return true;
};

const getNextNickOnConflict = (connection: IrcConnectionState, attemptedNick: string) => {
  const fallbacks = [connection.profile.nick, ...connection.profile.altNicks]
    .filter((nick, index, list) => nick && list.indexOf(nick) === index);
  const currentIndex = fallbacks.indexOf(attemptedNick);
  if (currentIndex !== -1 && currentIndex < fallbacks.length - 1) {
    return fallbacks[currentIndex + 1];
  }
  return `${attemptedNick}_`;
};

const isSelfNick = (connection: IrcConnectionState, nick: string | null) =>
  isSameIrcIdentifier(nick, connection.currentNick) || isSameIrcIdentifier(nick, connection.pendingNick);

const handleTextMessage = (connection: IrcConnectionState, command: 'PRIVMSG' | 'NOTICE', params: string[], nick: string | null) => {
  const rawTarget = params[0] ?? 'server';
  const trackedChannel = isChannelTarget(rawTarget) ? resolveTrackedChannel(connection, rawTarget) : null;
  if (isChannelTarget(rawTarget) && !trackedChannel) {
    return;
  }
  const payload = params[1] ?? '';
  const ctcp = stripCtcp(payload);
  const isDirectTarget = !isChannelTarget(rawTarget) && isSelfNick(connection, rawTarget);
  const isDirectCtcp = isDirectTarget && ctcp !== null && !ctcp.startsWith('ACTION ');
  const isDirectServiceMessage = isDirectTarget && command === 'PRIVMSG' && isServiceNick(nick);
  const replyTarget = isDirectTarget && command === 'NOTICE'
    ? connection.consumeReplyTarget(command, params, nick, rawTarget)
    : null;
  const target = isDirectTarget
    ? (replyTarget ?? (command === 'NOTICE' || isDirectCtcp || isDirectServiceMessage ? 'server' : nick ?? rawTarget))
    : trackedChannel ?? rawTarget;
  const body = ctcp?.startsWith('ACTION ')
    ? `* ${nick ?? target} ${ctcp.slice('ACTION '.length)}`
    : isDirectCtcp
      ? `<${ctcp}>`
      : payload;
  emitMessage(connection, createMessage(connection, {
    target,
    nick,
    body,
    kind: command === 'NOTICE' ? 'notice' : 'line',
    self: isSelfNick(connection, nick),
  }));
};

const handleJoin = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const name = (params[0] ?? params[1] ?? '').replace(/^:/, '');
  if (!name) {
    return;
  }
  const selfJoin = isSelfNick(connection, nick);
  const pendingSession = selfJoin ? connection.getChannelSession(name) : null;
  if (selfJoin) {
    discardPendingChannelReplyContexts(connection, name, (context) => context.operation === 'join');
    if (!pendingSession) {
      connection.setChannelSession(name, 'joined', { sourceTarget: 'server' });
    }
  }
  const channel = resolveTrackedChannel(connection, name);
  if (!channel) {
    return;
  }
  const users = connection.updateChannelUsers(channel, nick, true);
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} joined ${channel}`,
    kind: 'join',
    self: selfJoin,
  }));
  emitChannel(connection, channel, { users });
  if (selfJoin && pendingSession) {
    connection.setChannelSession(channel, 'joined', { sourceTarget: pendingSession.sourceTarget });
  }
};

const handlePart = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  if (!channel) {
    return;
  }
  const reason = params[1] ?? 'left';
  const selfPart = isSelfNick(connection, nick);
  if (!selfPart && !resolveTrackedChannel(connection, channel)) {
    return;
  }
  if (selfPart) {
    discardPendingChannelReplyContexts(connection, channel, (context) => context.operation !== 'join');
  }
  const users = selfPart ? [] : connection.updateChannelUsers(channel, nick, false);
  if (selfPart) {
    const session = connection.getChannelSession(channel);
    if (session?.phase === 'joining') {
      connection.channelUsers.set(channel, []);
      connection.setChannelSession(channel, 'joining', {
        sourceTarget: session.sourceTarget,
        visiblePending: session.visiblePending,
        previouslyJoined: false,
      });
    } else {
      connection.removeChannelSession(channel);
    }
  }
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick,
    body: `${nick ?? 'Someone'} left ${channel}${reason ? ` (${reason})` : ''}`,
    kind: 'part',
    self: selfPart,
  }));
  if (!selfPart) {
    emitChannel(connection, channel, { users });
  }
};

const handleKick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  const kickedNick = params[1] ?? '';
  if (!channel || !kickedNick || !resolveTrackedChannel(connection, channel)) {
    return;
  }
  const selfKick = isSelfNick(connection, kickedNick);
  const reason = params[2] ?? 'kicked';
  if (selfKick) {
    discardPendingChannelReplyContexts(connection, channel, (context) => context.operation !== 'join');
  }
  const users = selfKick ? [] : connection.updateChannelUsers(channel, kickedNick, false);
  if (selfKick) {
    const session = connection.getChannelSession(channel);
    if (session?.phase === 'joining') {
      connection.channelUsers.set(channel, []);
      connection.setChannelSession(channel, 'joining', {
        sourceTarget: session.sourceTarget,
        visiblePending: session.visiblePending,
        previouslyJoined: false,
      });
    } else {
      connection.removeChannelSession(channel);
    }
  }
  emitMessage(connection, createMessage(connection, {
    target: channel,
    nick: kickedNick,
    body: `${kickedNick} was kicked from ${channel} by ${nick ?? 'Someone'}${reason ? ` (${reason})` : ''}`,
    kind: 'part',
    self: selfKick,
  }));
  if (!selfKick) {
    emitChannel(connection, channel, { users });
  }
};

const handleQuit = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  emitStatus(connection, `${nick ?? 'Someone'} quit (${params[0] ?? 'quit'})`);
  for (const [channel, users] of connection.channelUsers) {
    if (!nick) {
      continue;
    }
    const nextUsers = removeChannelUser(users, nick);
    if (nextUsers.length !== users.length) {
      connection.channelUsers.set(channel, nextUsers);
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
};

const handleNick = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const newNick = params[0] ?? '';
  if (!newNick) {
    return;
  }
  for (const [channel, users] of connection.channelUsers) {
    if (!nick) {
      continue;
    }
    const nextUsers = renameChannelUser(users, nick, newNick);
    if (nextUsers.length !== users.length || nextUsers.some((user, index) => user !== users[index])) {
      connection.channelUsers.set(channel, nextUsers);
      emitChannel(connection, channel, { users: nextUsers });
    }
  }
  if (isSelfNick(connection, nick)) {
    consumePendingNickReplyContexts(connection, newNick);
    connection.currentNick = newNick;
    connection.pendingNick = getLatestPendingNick(connection.pendingReplyContexts);
    emitState(connection);
  }
  emitStatus(connection, `${nick ?? 'Someone'} is now known as ${newNick}`);
};

const handleTopic = (connection: IrcConnectionState, params: string[], nick: string | null) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  const topic = params[1] ?? '';
  if (!channel) {
    return;
  }
  if (isSelfNick(connection, nick)) {
    discardPendingChannelReplyContexts(
      connection,
      channel,
      (context) => context.operation === 'topic-set' && context.requestedTopic === topic
    );
  }
  emitChannel(connection, channel, { topic });
  emitStatus(connection, `${nick ?? 'Someone'} changed the topic for ${channel}`, 'system', channel, true);
};

const handleMode = (connection: IrcConnectionState, params: string[]) => {
  const channel = resolveTrackedChannel(connection, params[0] ?? '');
  const modeSequence = params[1] ?? '';
  if (!channel || !modeSequence) {
    return;
  }
  let users = connection.channelUsers.get(channel) ?? [];
  let sign: '+' | '-' = '+';
  let parameterIndex = 2;
  let changed = false;

  for (const [index, token] of Array.from(modeSequence).entries()) {
    if (token === '+' || token === '-') {
      sign = token;
      continue;
    }
    const mode = modeFromToken(token);
    if (mode) {
      const nick = params[parameterIndex++];
      if (!nick) {
        continue;
      }
      const nextUsers = updateChannelUserMode(users, nick, sign === '+' ? mode : 'normal');
      if (nextUsers.some((user, index) => user !== users[index]) || nextUsers.length !== users.length) {
        users = nextUsers;
        changed = true;
      }
      continue;
    }
    if (
      modeTokenConsumesParameter(token, sign)
      || shouldConsumeUnknownModeParameter(modeSequence, index, sign, params, parameterIndex)
    ) {
      parameterIndex += 1;
      continue;
    }
  }

  if (changed) {
    connection.channelUsers.set(channel, users);
    emitChannel(connection, channel, { users });
  }
};

const createMessage = (
  connection: IrcConnectionState,
  input: Omit<MessageInput, 'id' | 'networkId' | 'ts'>
): MessageInput => ({
  id: randomUUID(),
  networkId: connection.profile.id,
  ts: Date.now(),
  ...input,
});

const formatPingReply = (line: string, params: string[]) => {
  if (/^PING\b/i.test(line)) {
    return line.replace(/^PING\b/i, 'PONG');
  }
  if (params.length === 0) {
    return 'PONG';
  }
  if (params.length === 1) {
    return `PONG :${params[0]}`;
  }
  return `PONG ${params.join(' ')}`;
};

const resolveTrackedChannel = (connection: IrcConnectionState, channel: string) =>
  channel
    ? findIrcCaseMatch(connection.channelSessions.keys(), channel)
      ?? findIrcCaseMatch(connection.channelUsers.keys(), channel)
      ?? null
    : null;

const discardPendingChannelReplyContexts = (
  connection: IrcConnectionState,
  channel: string,
  predicate?: (context: Extract<PendingReplyContext, { kind: 'channel' }>) => boolean
) => {
  const contexts = [];
  for (let index = connection.pendingReplyContexts.length - 1; index >= 0; index -= 1) {
    const context = connection.pendingReplyContexts[index];
    if (
      context?.kind === 'channel'
      && isSameIrcIdentifier(context.channel, channel)
      && (!predicate || predicate(context))
    ) {
      contexts.push(connection.pendingReplyContexts.splice(index, 1)[0]!);
    }
  }
  return contexts;
};

const consumePendingNickReplyContexts = (
  connection: IrcConnectionState,
  requestedNick: string
) => {
  const contexts = [];
  for (let index = connection.pendingReplyContexts.length - 1; index >= 0; index -= 1) {
    const context = connection.pendingReplyContexts[index];
    if (context?.kind === 'nick' && isSameIrcIdentifier(context.requestedNick, requestedNick)) {
      contexts.push(connection.pendingReplyContexts.splice(index, 1)[0]!);
    }
  }
  return contexts;
};

const discardPendingNickReplyContexts = (connection: IrcConnectionState) => {
  const contexts = [];
  for (let index = connection.pendingReplyContexts.length - 1; index >= 0; index -= 1) {
    const context = connection.pendingReplyContexts[index];
    if (context?.kind === 'nick') {
      contexts.push(connection.pendingReplyContexts.splice(index, 1)[0]!);
    }
  }
  return contexts;
};

const modeFromToken = (token: string) => {
  if (token === 'q') {
    return 'owner';
  }
  if (token === 'a') {
    return 'admin';
  }
  if (token === 'o') {
    return 'op';
  }
  if (token === 'h') {
    return 'halfop';
  }
  if (token === 'v') {
    return 'voice';
  }
  return null;
};

const modeTokenConsumesParameter = (token: string, sign: '+' | '-') =>
  channelModeArgumentTokens.has(token) || (sign === '+' && channelModeSetOnlyArgumentTokens.has(token));

const shouldConsumeUnknownModeParameter = (
  modeSequence: string,
  tokenIndex: number,
  sign: '+' | '-',
  params: string[],
  parameterIndex: number
) => {
  const remainingParams = params.length - parameterIndex;
  if (remainingParams <= 0 || modeTokenConsumesParameter(modeSequence[tokenIndex] ?? '', sign)) {
    return false;
  }
  return remainingParams > countKnownModeParameters(modeSequence, tokenIndex + 1, sign);
};

const countKnownModeParameters = (modeSequence: string, startIndex: number, initialSign: '+' | '-') => {
  let sign = initialSign;
  let count = 0;
  for (const token of modeSequence.slice(startIndex)) {
    if (token === '+' || token === '-') {
      sign = token;
      continue;
    }
    if (modeFromToken(token) || modeTokenConsumesParameter(token, sign)) {
      count += 1;
    }
  }
  return count;
};
