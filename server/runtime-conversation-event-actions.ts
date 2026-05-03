import { randomUUID } from 'node:crypto';
import type { MessageKind } from '../shared/protocol-chat.js';
import type { ServerMessage } from '../shared/protocol-messages.js';
import { isUserMuted, resolveMutedTarget } from '../shared/muted-nicks.js';
import { isSameIrcIdentifier } from './irc-parser.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import {
  appendConversationMessage,
  upsertConversationChannel,
} from './runtime-conversation-store.js';
import { isChannelTarget, type RuntimeConversationServiceOptions } from './runtime-conversation-service-shared.js';
import type { MessageInput } from './storage-types.js';

export const handleRuntimeConversationStatusEvent = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'status' }>,
) => event.kind !== 'system'
  ? [{ type: event.kind === 'error' ? 'error' : 'notice', networkId: event.networkId, message: event.message } satisfies ServerMessage]
  : appendRuntimeConversationMessage(options, {
    id: randomUUID(),
    networkId: event.networkId,
    target: resolveStatusTarget(options, event),
    nick: null,
    body: event.message,
    kind: 'system' satisfies MessageKind,
    self: false,
    ts: Date.now(),
  });

export const handleRuntimeConversationSendFailure = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'send-failed' }>,
) => {
  const messages: ServerMessage[] = [];
  if (event.rollbackMessageId) {
    const deleted = options.conversations.deleteMessagesByIdPrefixes([event.rollbackMessageId]);
    if (deleted.length > 0) {
      messages.push({
        type: 'message.remove',
        networkId: event.networkId,
        target: event.target,
        messageIds: deleted.map((message) => message.id),
      });
    }
  }
  messages.push({ type: 'error', networkId: event.networkId, message: event.message });
  return messages;
};

export const handleRuntimeConversationMessageEvent = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'message' }>,
) => {
  const openTargetNotice = event.message.kind === 'notice'
    && event.message.target !== 'server'
    && !isChannelTarget(event.message.target)
    && !findOpenBufferByTarget(options, event.message.networkId, event.message.target);
  const message = openTargetNotice ? { ...event.message, target: 'server' } : event.message;
  const messageMuted = isUserMuted(
    options.mutedNicks.list(message.networkId),
    resolveMutedTarget(message.networkId, message.nick, message.senderIdentity),
  );
  const removedChannel = event.message.self && event.message.kind === 'part'
    ? options.conversations.getChannelByName(event.message.networkId, event.message.target)
    : null;
  if (event.message.self && event.message.kind === 'part' && !removedChannel) {
    return [];
  }
  const { saved, bufferUpdate } = appendConversationMessage(options.conversations, {
    message,
    currentNick: event.currentNick,
    altNicks: event.altNicks,
    messageMuted,
    allowCreateBuffer: !messageMuted
      || message.self
      || message.target === 'server'
      || isChannelTarget(message.target)
      || (message.kind !== 'line' && message.kind !== 'action'),
  });
  const messages: ServerMessage[] = [{ type: 'message.append', message: saved }];
  if (bufferUpdate) {
    messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
  }
  const closedServiceQuery = !event.message.self
    && event.message.target === 'server'
    && !!event.message.nick
    && isServiceNick(event.message.nick)
    ? findOpenBufferByTarget(options, event.message.networkId, event.message.nick)
    : null;
  if (closedServiceQuery?.kind === 'query') {
    options.conversations.removeBuffer(closedServiceQuery.id);
    messages.push({
      type: 'buffer.remove',
      networkId: closedServiceQuery.networkId,
      bufferId: closedServiceQuery.id,
    });
  }
  if (removedChannel) {
    options.conversations.deleteChannelByName(event.message.networkId, event.message.target);
    messages.push({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
  }
  return messages;
};

export const handleRuntimeConversationPeerQuitEvent = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'peer-quit' }>,
) => {
  if (event.self) {
    return [];
  }
  const queryBuffer = findOpenBufferByTarget(options, event.networkId, event.nick);
  if (queryBuffer?.kind !== 'query') {
    return [];
  }
  return appendRuntimeConversationMessage(options, {
    id: randomUUID(),
    networkId: event.networkId,
    target: queryBuffer.target,
    nick: event.nick,
    body: `${event.nick} quit (${event.reason})`,
    kind: 'quit' satisfies MessageKind,
    self: false,
    ts: Date.now(),
  });
};

export const handleRuntimeConversationPeerNickEvent = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'peer-nick' }>,
) => {
  const messages: ServerMessage[] = [];
  let queryTarget: string | null = null;
  if (!event.self) {
    const renamed = options.conversations.recordObservedQueryNickChange(
      event.networkId,
      event.oldNick,
      event.newNick,
    );
    if (renamed) {
      queryTarget = renamed.buffer.target;
      messages.push({ type: 'buffer.upsert', buffer: renamed.buffer });
      if (renamed.removedBufferId) {
        messages.push({
          type: 'buffer.remove',
          networkId: event.networkId,
          bufferId: renamed.removedBufferId,
        });
      }
    }
  }

  const noticeTargets = new Set(resolveNickChangeChannelTargets(options, event));
  if (queryTarget) {
    noticeTargets.add(queryTarget);
  }
  if (noticeTargets.size === 0) {
    noticeTargets.add('server');
  }

  for (const target of noticeTargets) {
    messages.push(...appendRuntimeConversationMessage(options, createNickChangeMessage(event, target)));
  }

  return messages;
};

export const handleRuntimeConversationChannelEvent = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'channel' }>,
) => {
  const { buffer, channel } = upsertConversationChannel(options.conversations, event);
  return [{ type: 'buffer.upsert', buffer }, { type: 'channel.snapshot', channel }] satisfies ServerMessage[];
};

const appendRuntimeConversationMessage = (
  options: RuntimeConversationServiceOptions,
  message: MessageInput,
) => {
  const messageMuted = isUserMuted(
    options.mutedNicks.list(message.networkId),
    resolveMutedTarget(message.networkId, message.nick, message.senderIdentity),
  );
  const { saved, bufferUpdate } = appendConversationMessage(options.conversations, {
    message,
    messageMuted,
  });
  const messages: ServerMessage[] = [{ type: 'message.append', message: saved }];
  if (bufferUpdate) {
    messages.push({ type: 'buffer.upsert', buffer: bufferUpdate });
  }
  return messages;
};

const createNickChangeMessage = (
  event: Extract<RuntimeEvent, { type: 'peer-nick' }>,
  target: string,
): MessageInput => ({
  id: randomUUID(),
  networkId: event.networkId,
  target,
  nick: null,
  body: `${event.oldNick} is now known as ${event.newNick}`,
  kind: 'system',
  self: event.self,
  ts: Date.now(),
});

const resolveNickChangeChannelTargets = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'peer-nick' }>,
) => options.conversations
  .listChannels(event.networkId)
  .filter((channel) => channel.users.some((user) => isSameIrcIdentifier(user.nick, event.newNick)))
  .map((channel) => channel.name);

const resolveStatusTarget = (
  options: RuntimeConversationServiceOptions,
  event: Extract<RuntimeEvent, { type: 'status' }>,
) => {
  if (!event.target || event.target === 'server') {
    return 'server';
  }
  const boundTarget = findOpenBufferByTarget(options, event.networkId, event.target)?.target;
  if (boundTarget) {
    return boundTarget;
  }
  return isChannelTarget(event.target) || event.requireBoundTarget ? 'server' : event.target;
};

const findOpenBufferByTarget = (
  options: RuntimeConversationServiceOptions,
  networkId: string,
  target: string,
) => options.conversations
  .listBuffers(networkId)
  .find((buffer) => isSameIrcIdentifier(buffer.target, target)) ?? null;
