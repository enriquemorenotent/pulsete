import { emitMessage } from './irc-emit.js';
import { isServiceNick } from './irc-services.js';
import { isChannelTarget, stripCtcp } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcConnectionState } from './irc-types.js';

export const handleTextMessage = (
  connection: IrcConnectionState,
  command: 'PRIVMSG' | 'NOTICE',
  params: string[],
  nick: string | null
) => {
  const rawTarget = params[0] ?? 'server';
  const trackedChannel = isChannelTarget(rawTarget) ? connection.resolveTrackedChannel(rawTarget) : null;
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
