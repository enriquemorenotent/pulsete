import { emitMessage } from './irc-emit.js';
import { handleNickservAutoJoinMessage } from './irc-auth.js';
import { isServiceNick } from './irc-services.js';
import { parseServerTimeTag, type IrcMessageTags } from './irc-message-tags.js';
import { isChannelTarget, stripCtcp } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcMessageEventContext } from './irc-contexts.js';

export const handleTextMessage = (
  connection: IrcMessageEventContext,
  command: 'PRIVMSG' | 'NOTICE' | 'TAGMSG',
  params: string[],
  nick: string | null,
  sourceIsUser: boolean,
  prefix: string | null,
  tags: IrcMessageTags,
  replyLabel: string | null,
) => {
  if (command === 'TAGMSG') {
    return;
  }
  const rawTarget = params[0] ?? 'server';
  const trackedChannel = isChannelTarget(rawTarget) ? connection.resolveTrackedChannel(rawTarget) : null;
  if (isChannelTarget(rawTarget) && !trackedChannel) {
    return;
  }
  const payload = params[1] ?? '';
  const ctcp = stripCtcp(payload);
  const isDirectTarget = !isChannelTarget(rawTarget) && isSelfNick(connection, rawTarget);
  const isDirectCtcp = isDirectTarget && ctcp !== null && !ctcp.startsWith('ACTION ');
  const isDirectServiceMessage = isDirectTarget && !!nick && isServiceNick(nick);
  const isDirectUserNotice =
    isDirectTarget && command === 'NOTICE' && sourceIsUser && !!nick && !isDirectServiceMessage;
  const directNoticeReplyContext =
    isDirectTarget && command === 'NOTICE' && sourceIsUser && !!nick
      ? connection.consumeReplyContext(command, params, nick, rawTarget, replyLabel)
      : null;
  const replyTarget =
    directNoticeReplyContext
    && directNoticeReplyContext.kind === 'message'
    && (!isDirectServiceMessage || directNoticeReplyContext.outboundCommand === 'PRIVMSG')
      ? directNoticeReplyContext.sourceTarget
      : null;
  const target = isDirectTarget
    ? (
        replyTarget
        ?? (
          isDirectUserNotice
            ? nick
            : (command === 'NOTICE' || isDirectCtcp || isDirectServiceMessage ? 'server' : nick ?? rawTarget)
        )
      )
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
    ts: parseServerTimeTag(tags) ?? undefined,
  }));
  if (prefix) {
    handleNickservAutoJoinMessage(connection, rawTarget, nick, payload);
  }
};
