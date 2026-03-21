import tls from 'node:tls';
import { emitStatus } from './irc-emit.js';
import { formatServerNumeric } from './irc-server-log.js';
import { isChannelTarget, isSameIrcIdentifier } from './irc-parser.js';
import type { IrcConnectionState } from './irc-types.js';

const nickRejectionCommands = new Set(['431', '432', '436', '437']);

export const handleRegistrationLine = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null
) => handleWelcome(connection, command, params, nick)
  || handleNickConflict(connection, command, params, nick)
  || handleNickRejected(connection, command, params, nick);

const handleWelcome = (connection: IrcConnectionState, command: string, params: string[], nick: string | null) => {
  if (command !== '001') {
    return false;
  }
  connection.markRegistered(nick, params[0] ?? connection.profile.nick);
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
  const replyTarget = replyContext && 'sourceTarget' in replyContext ? replyContext.sourceTarget : undefined;
  if (
    replyContext?.kind === 'nick'
    && connection.pendingNick
    && !isSameIrcIdentifier(connection.pendingNick, attemptedNick)
  ) {
    emitStatus(connection, `${attemptedNick} is already in use. Keeping ${connection.pendingNick} as the pending nick.`, 'notice', replyTarget, true);
    return true;
  }
  const fallbackNick = getNextNickOnConflict(connection, attemptedNick);
  const shouldUpdatePendingNick = replyContext?.kind === 'nick' || !!connection.pendingNick;
  if (!connection.sendRaw(`NICK ${fallbackNick}`)) {
    return true;
  }
  connection.applyNickFallback(fallbackNick, { replyTarget, updatePending: shouldUpdatePendingNick });
  emitStatus(connection, `${attemptedNick} is already in use. Retrying with ${fallbackNick}...`, 'notice', replyTarget, true);
  return true;
};

const handleNickRejected = (
  connection: IrcConnectionState,
  command: string,
  params: string[],
  nick: string | null
) => {
  if (!nickRejectionCommands.has(command) || command === '433' || (command === '437' && isChannelTarget(params[1] ?? ''))) {
    return false;
  }
  const replyContext = connection.consumeReplyContext(command, params, nick);
  const rejectedNick = replyContext?.kind === 'nick' ? replyContext.requestedNick : connection.pendingNick;
  if (!rejectedNick) {
    return false;
  }
  const replyTarget = replyContext && 'sourceTarget' in replyContext ? replyContext.sourceTarget : undefined;
  if (!replyContext) {
    connection.clearPendingNick();
  }
  emitStatus(connection, `${rejectedNick} was rejected by the server`, 'error', replyTarget, true);
  return true;
};

const getNextNickOnConflict = (connection: IrcConnectionState, attemptedNick: string) => {
  const fallbacks = [connection.profile.nick, ...connection.profile.altNicks]
    .filter((nick, index, list) => nick && list.indexOf(nick) === index);
  const currentIndex = fallbacks.indexOf(attemptedNick);
  return currentIndex !== -1 && currentIndex < fallbacks.length - 1
    ? fallbacks[currentIndex + 1] as string
    : `${attemptedNick}_`;
};
