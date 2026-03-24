import { emitMessage } from './irc-emit.js';
import { handleNickservAutoJoinMessage } from './irc-auth.js';
import { isServiceNick } from './irc-services.js';
import { isChannelTarget, stripCtcp } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcMessageEventContext } from './irc-contexts.js';

export const handleTextMessage = (
  connection: IrcMessageEventContext,
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
  const isAction = ctcp?.startsWith('ACTION ') ?? false;
  const actionBody = isAction && ctcp ? ctcp.slice('ACTION '.length) : null;
  const body = actionBody !== null
    ? actionBody
    : isDirectCtcp
      ? `<${ctcp}>`
      : payload;
  emitMessage(connection, createMessage(connection, {
    target,
    nick,
    body,
    kind: command === 'NOTICE' ? 'notice' : isAction ? 'action' : 'line',
    self: isSelfNick(connection, nick),
  }));
  handleNickservAutoJoinMessage(connection, rawTarget, nick, payload);
};
