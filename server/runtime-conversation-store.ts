import { randomUUID } from 'node:crypto';
import type { BufferState, ChannelState } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import type { RuntimeEvent } from './irc-types.js';
import { resolveNextBufferActivity } from './runtime-buffer-activity.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';

export const openConversationQuery = (store: RuntimeConversationStore, networkId: string, target: string) =>
  store.upsertQuery(networkId, target);

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

export const listConversationBufferHistory = (
  store: RuntimeConversationStore,
  bufferId: string,
  limit: number,
  beforeMessageId?: string,
) => {
  const buffer = getRequiredBuffer(store, bufferId);
  return store.listMessagePage(buffer.networkId, buffer.target, limit, beforeMessageId);
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
  const bufferUpdate = resolveMessageBuffer(store, input);
  return {
    saved: store.appendMessage(input.message),
    bufferUpdate,
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
  const created = existing ?? createMessageBuffer(store, input.message);
  if (!created) {
    return null;
  }

  const nextBuffer = resolveNextBufferActivity({
    buffer: created,
    message: input.message,
    currentNick: input.currentNick,
    altNicks: input.altNicks,
    messageMuted: input.messageMuted,
  });
  if (nextBuffer === created) {
    return created;
  }
  return store.upsertBuffer(nextBuffer);
};

const createMessageBuffer = (store: RuntimeConversationStore, message: MessageInput): BufferState | null => {
  if (message.target === 'server') {
    return store.getServerBuffer(message.networkId)
      ?? store.upsertBuffer({ networkId: message.networkId, kind: 'server', target: 'server' });
  }
  if (isChannelTarget(message.target)) {
    if (message.self && message.kind === 'part') {
      return null;
    }
    return store.upsertBuffer({ networkId: message.networkId, kind: 'channel', target: message.target });
  }
  if (message.kind === 'line' || message.kind === 'action') {
    return store.upsertQuery(message.networkId, message.target);
  }
  return null;
};

const getRequiredBuffer = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = store.getBuffer(bufferId);
  if (!buffer) {
    throw notFound('Buffer not found');
  }
  return buffer;
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
