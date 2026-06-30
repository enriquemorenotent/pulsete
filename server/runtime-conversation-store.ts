import { randomUUID } from 'node:crypto';
import type { BufferState, ChannelState } from '../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../shared/user-identity.js';
import { badRequest } from './app-error.js';
import type { RuntimeEvent } from './irc-types.js';
import { resolveNextBufferActivity } from './runtime-buffer-activity.js';
import { getRequiredBuffer } from './runtime-conversation-store-helpers.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';

type BufferResolution = {
  buffer: BufferState;
  removedBufferIds: string[];
  retargetedFrom?: string | null;
};

export const openConversationQuery = (
  store: RuntimeConversationStore,
  networkId: string,
  target: string,
  peerIdentity?: NetworkUserIdentity | null,
) => store.upsertQueryWithMergeResult(networkId, target, peerIdentity);

export const closeConversationBuffer = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.kind === 'server') {
    throw badRequest('Only channels and private messages can be closed');
  }
  return store.removeBuffer(bufferId) ?? buffer;
};

export const markConversationBufferRead = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = getRequiredBuffer(store, bufferId);
  const latestMessage = store.listRecentMessagesForBuffer(buffer.networkId, buffer.target, 1)[0] ?? null;
  const nextLastReadTs = latestMessage?.ts ?? buffer.lastReadTs ?? null;
  const nextLastReadMessageId = latestMessage?.id ?? buffer.lastReadMessageId ?? null;
  if (
    buffer.unread === 0
    && buffer.priorityUnread === 0
    && buffer.lastReadTs === nextLastReadTs
    && buffer.lastReadMessageId === nextLastReadMessageId
  ) {
    return buffer;
  }
  store.markBufferRead(bufferId, {
    lastReadTs: nextLastReadTs,
    lastReadMessageId: nextLastReadMessageId,
  });
  return getRequiredBuffer(store, bufferId);
};

export const clearConversationQueryHistory = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.kind !== 'query') {
    throw badRequest('Only private-message history can be deleted');
  }
  const deletedMessages = store.deleteMessages(buffer.networkId, buffer.target);
  store.markBufferRead(buffer.id, { lastReadTs: null, lastReadMessageId: null });
  return {
    buffer: getRequiredBuffer(store, buffer.id),
    deletedMessages,
  };
};

export const saveConversationBufferNotes = (
  store: RuntimeConversationStore,
  bufferId: string,
  notes: string,
) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.kind !== 'query') {
    throw badRequest('Only private messages can have notes');
  }
  return store.setBufferNotes(bufferId, notes) ?? buffer;
};

export const listConversationBufferHistory = (
  store: RuntimeConversationStore,
  bufferId: string,
  limit: number,
  beforeMessageId?: string,
) => {
  const buffer = getRequiredBuffer(store, bufferId);
  return store.listMessagePage(buffer.networkId, buffer.target, limit, beforeMessageId);
};

export const searchConversationBufferHistory = (
  store: RuntimeConversationStore,
  bufferId: string,
  query: string,
  limit: number,
) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.kind === 'server') {
    throw badRequest('Only channels and private messages can search history');
  }
  return store.searchMessagesByBufferId(buffer.id, query, limit);
};

export const appendConversationMessage = (
  store: RuntimeConversationStore,
  input: {
    message: MessageInput;
    currentNick?: string | null;
    altNicks?: readonly string[];
    messageMuted?: boolean;
    allowCreateBuffer?: boolean;
  },
) => {
  const existing = input.message.historical ? store.getMessageById(input.message.id) : null;
  if (existing) {
    return {
      saved: existing,
      bufferUpdate: null,
      removedBufferIds: [],
      retargetedFrom: null,
    };
  }
  const resolvedBuffer = resolveMessageBuffer(store, input);
  return {
    saved: store.appendMessage(input.message, resolvedBuffer?.buffer.id),
    bufferUpdate: resolvedBuffer?.buffer ?? null,
    removedBufferIds: resolvedBuffer?.removedBufferIds ?? [],
    retargetedFrom: resolvedBuffer?.retargetedFrom ?? null,
  };
};

export const upsertConversationChannel = (
  store: RuntimeConversationStore,
  event: Extract<RuntimeEvent, { type: 'channel' }>
): { buffer: BufferState; channel: ChannelState } => {
  const channel = store.upsertChannel({
    id: store.getChannelByName(event.networkId, event.channel)?.id ?? randomUUID(),
    networkId: event.networkId,
    name: event.channel,
    topic: event.topic,
    users: event.users,
  });
  return {
    channel,
    buffer: store.getBuffer(channel.id)!,
  };
};

const resolveMessageBuffer = (
  store: RuntimeConversationStore,
  input: {
    message: MessageInput;
    currentNick?: string | null;
    altNicks?: readonly string[];
    messageMuted?: boolean;
    allowCreateBuffer?: boolean;
  },
) => {
  const existing = store.getBufferByTarget(input.message.networkId, input.message.target);
  if (!existing && input.allowCreateBuffer === false) {
    return null;
  }
  const created = shouldRouteQueryByIdentity(input.message)
    ? store.upsertQueryWithMergeResult(input.message.networkId, input.message.target, input.message.senderIdentity)
    : existing
      ? toBufferResolution(existing)
      : createMessageBuffer(store, input.message);
  const createdWithAvatar = applyQueryAvatarId(store, created, input.message);
  if (!createdWithAvatar) {
    return null;
  }

  const nextBuffer = resolveNextBufferActivity({
    buffer: createdWithAvatar.buffer,
    message: input.message,
    currentNick: input.currentNick,
    altNicks: input.altNicks,
    messageMuted: input.messageMuted,
  });
  if (nextBuffer === createdWithAvatar.buffer) {
    return createdWithAvatar;
  }
  return {
    buffer: store.upsertBuffer(nextBuffer),
    removedBufferIds: createdWithAvatar.removedBufferIds,
    retargetedFrom: createdWithAvatar.retargetedFrom ?? null,
  };
};

const createMessageBuffer = (store: RuntimeConversationStore, message: MessageInput): BufferResolution | null => {
  if (message.target === 'server') {
    return toBufferResolution(
      store.getServerBuffer(message.networkId)
        ?? store.upsertBuffer({ networkId: message.networkId, kind: 'server', target: 'server' }),
    );
  }
  if (isChannelTarget(message.target)) {
    if (message.self && message.kind === 'part') {
      return null;
    }
    return toBufferResolution(store.upsertBuffer({ networkId: message.networkId, kind: 'channel', target: message.target }));
  }
  if (message.kind === 'line' || message.kind === 'action') {
    return store.upsertQueryWithMergeResult(
      message.networkId,
      message.target,
      message.self ? null : message.senderIdentity,
      message.self ? undefined : message.ircCloudAvatarId ?? undefined,
    );
  }
  return null;
};

const shouldRouteQueryByIdentity = (message: MessageInput) =>
  !message.self
  && !isChannelTarget(message.target)
  && message.target !== 'server'
  && !!message.senderIdentity
  && (message.kind === 'line' || message.kind === 'action');

const applyQueryAvatarId = (
  store: RuntimeConversationStore,
  resolution: BufferResolution | null,
  message: MessageInput,
) => {
  if (
    !resolution
    || message.self
    || resolution.buffer.kind !== 'query'
    || !message.ircCloudAvatarId
    || resolution.buffer.ircCloudAvatarId === message.ircCloudAvatarId
  ) {
    return resolution;
  }
  return {
    ...resolution,
    buffer: store.upsertBuffer({
      ...resolution.buffer,
      ircCloudAvatarId: message.ircCloudAvatarId,
    }),
  };
};

const toBufferResolution = (buffer: BufferState): BufferResolution => ({
  buffer,
  removedBufferIds: [],
  retargetedFrom: null,
});

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
