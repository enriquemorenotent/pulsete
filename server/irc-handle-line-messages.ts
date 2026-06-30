import { emitMessage } from './irc-emit.js';
import { handleNickservAutoJoinMessage } from './irc-auth.js';
import { isChatHistoryBatchMessage } from './irc-history.js';
import { isServiceNick } from './irc-services.js';
import { parseServerTimeTag, type IrcMessageTags } from './irc-message-tags.js';
import { isChannelTarget, parsePrefixIdentity, stripCtcp } from './irc-parser.js';
import { createMessage, isSelfNick } from './irc-handle-line-helpers.js';
import type { IrcMessageEventContext } from './irc-contexts.js';
import { resolveNetworkUserIdentity } from '../shared/user-identity.js';
import { resolveIrcCloudAvatarId } from '../shared/irccloud-avatar.js';

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
  const prefixIdentity = parsePrefixIdentity(prefix);
  const senderIdentity = resolveNetworkUserIdentity({
    nick,
    account: tags.account,
    username: prefixIdentity.username,
    host: prefixIdentity.host,
  });
  const ircCloudAvatarId = isDirectTarget && !isSelfNick(connection, nick)
    ? resolveIrcCloudAvatarId(prefixIdentity)
    : null;
  const historical = isChatHistoryBatchMessage(connection, tags.batch);
  emitMessage(connection, createMessage(connection, {
    id: resolveTaggedMessageId(connection.profile.id, tags.msgid),
    target,
    nick,
    senderIdentity,
    ...(ircCloudAvatarId ? { ircCloudAvatarId } : {}),
    body,
    kind: command === 'NOTICE' ? 'notice' : isAction ? 'action' : 'line',
    self: isSelfNick(connection, nick),
    historical,
    ts: parseServerTimeTag(tags) ?? undefined,
  }));
  if (prefix) {
    handleNickservAutoJoinMessage(connection, rawTarget, nick, payload);
  }
};

const resolveTaggedMessageId = (networkId: string, msgid: string | null | undefined) => {
  const normalizedMsgid = msgid?.trim();
  return normalizedMsgid ? `ircv3:${networkId}:${normalizedMsgid}` : undefined;
};
