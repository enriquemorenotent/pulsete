import { randomUUID } from 'node:crypto';
import type { BufferState, ChannelState } from '../shared/protocol.js';
import { badRequest, notFound } from './app-error.js';
import type { RuntimeEvent } from './irc-types.js';
import type { RuntimeConversationStore } from './runtime-store-ports.js';
import type { MessageInput } from './storage-types.js';

export const openConversationQuery = (store: RuntimeConversationStore, networkId: string, target: string) =>
  store.upsertQuery(networkId, target);

export const closeConversationQueryBuffer = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.kind !== 'query') {
    throw badRequest('Only private message buffers can be closed');
  }
  return store.removeBuffer(bufferId) ?? buffer;
};

export const markConversationBufferRead = (store: RuntimeConversationStore, bufferId: string) => {
  const buffer = getRequiredBuffer(store, bufferId);
  if (buffer.unread === 0) {
    return buffer;
  }
  store.markBufferRead(bufferId);
  return getRequiredBuffer(store, bufferId);
};

export const listConversationBufferHistory = (store: RuntimeConversationStore, bufferId: string, limit: number) => {
  const buffer = getRequiredBuffer(store, bufferId);
  return store.listMessages(buffer.networkId, buffer.target, limit);
};

export const appendConversationMessage = (store: RuntimeConversationStore, message: MessageInput) => {
  const bufferUpdate = resolveMessageBuffer(store, message);
  return {
    saved: store.appendMessage(message),
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

const resolveMessageBuffer = (store: RuntimeConversationStore, message: MessageInput) => {
  const existing = store.getBufferByTarget(message.networkId, message.target);
  const created = existing ?? createMessageBuffer(store, message);
  if (!created) {
    return null;
  }

  const unread = shouldIncrementUnread(message) ? created.unread + 1 : created.unread;
  if (unread === created.unread) {
    return created;
  }
  store.setBufferUnread(created.id, unread);
  return store.getBuffer(created.id);
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
  if (message.kind === 'line') {
    return store.upsertBuffer({ networkId: message.networkId, kind: 'query', target: message.target });
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

const shouldIncrementUnread = (message: MessageInput) =>
  !message.self && (message.target === 'server' || message.kind !== 'system');

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
