import { isSameIrcIdentifier } from './irc-parser.js';
import { hasNegotiatedCapability } from './irc-capabilities.js';
import { createSelfActionMessage, createSelfMessage, sendTrackedRaw } from './irc-connection-io.js';
import { emitMessage, emitStatus } from './irc-emit.js';
import { createChannelReplyContext, createMessageReplyContext, createNickReplyContext } from './irc-reply-context.js';
import type { IrcConnectionState } from './irc-types.js';

const isCommandLikeMessage = (text: string) => text.trimStart().startsWith('!');

export const join = (connection: IrcConnectionState, channel: string, sourceTarget = 'server', options: { visiblePending?: boolean } | string = {}) => {
  if (!connection.lifecycle.connected) {
    emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
    return false;
  }
  if (!connection.sendRaw(`JOIN ${channel}`, sourceTarget)) {
    return false;
  }
  const visiblePending = typeof options === 'string' ? false : options.visiblePending ?? false;
  connection.setChannelSession(channel, 'joining', { sourceTarget, visiblePending });
  return true;
};

export const part = (connection: IrcConnectionState, channel: string, reason = 'Leaving', sourceTarget = channel) => {
  if (connection.getChannelSession(channel)?.phase === 'joined') {
    connection.setChannelSession(channel, 'leaving', { sourceTarget, visiblePending: false });
  }
  return sendTrackedRaw(connection, `PART ${channel} :${reason}`, sourceTarget, createChannelReplyContext(sourceTarget, channel, 'part'));
};

export const say = (connection: IrcConnectionState, target: string, text: string, sourceTarget = target) => {
  const useEchoMessage = hasNegotiatedCapability(connection.lifecycle.capabilities, 'echo-message');
  const selfMessage = useEchoMessage ? null : createSelfMessage(connection, target, text);
  if (sendTrackedRaw(
    connection,
    `PRIVMSG ${target} :${text}`,
    sourceTarget,
    createMessageReplyContext(sourceTarget, target, selfMessage?.id, 'PRIVMSG', isCommandLikeMessage(text),
      isSameIrcIdentifier(sourceTarget, target, connection.lifecycle.serverSupport.rules.caseMapping) && !text.startsWith('/') ? text : `/msg ${target} ${text}`),
  ) && selfMessage) {
    emitMessage(connection, selfMessage);
  }
};

export const action = (connection: IrcConnectionState, target: string, text: string, sourceTarget = target) => {
  const useEchoMessage = hasNegotiatedCapability(connection.lifecycle.capabilities, 'echo-message');
  const selfMessage = useEchoMessage ? null : createSelfActionMessage(connection, target, text);
  if (
    sendTrackedRaw(
      connection,
      `PRIVMSG ${target} :\u0001ACTION ${text}\u0001`,
      sourceTarget,
      createMessageReplyContext(sourceTarget, target, selfMessage?.id, 'PRIVMSG', false,
        isSameIrcIdentifier(sourceTarget, target, connection.lifecycle.serverSupport.rules.caseMapping) ? `/me ${text}` : undefined),
    )
    && selfMessage
  ) {
    emitMessage(connection, selfMessage);
  }
};

export const setNick = (connection: IrcConnectionState, nick: string, sourceTarget = 'server') => {
  if (!connection.lifecycle.connected) {
    emitStatus(connection, connection.lifecycle.socket ? 'Still connecting to server' : 'Not connected', 'error', sourceTarget);
    return false;
  }
  return sendTrackedRaw(connection, `NICK ${nick}`, sourceTarget, createNickReplyContext(sourceTarget, nick));
};
