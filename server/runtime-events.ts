import { randomUUID } from 'node:crypto';
import type { BufferState, MessageKind, ServerMessage } from '../shared/protocol.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import type { MessageInput, Storage } from './storage.js';

type RuntimeContext = {
  store: Storage;
  send(_legacyUserId: string, message: ServerMessage): void;
};

export function handleRuntimeEvent(runtime: RuntimeContext, event: RuntimeEvent): void;
export function handleRuntimeEvent(runtime: RuntimeContext, _legacyUserId: string, event: RuntimeEvent): void;
export function handleRuntimeEvent(
  runtime: RuntimeContext,
  legacyUserIdOrEvent: RuntimeEvent | string,
  maybeEvent?: RuntimeEvent
) {
  const event = typeof legacyUserIdOrEvent === 'string' ? maybeEvent! : legacyUserIdOrEvent;
  if (event.type === 'state') {
    runtime.send('local', {
      type: 'network.state',
      networkId: event.networkId,
      connected: event.connected,
      serverName: event.serverName,
      nick: event.nick,
    });
    return;
  }
  if (event.type === 'status') {
    handleStatusEvent(runtime, event);
    return;
  }
  if (event.type === 'message') {
    handleMessageEvent(runtime, event);
    return;
  }
  if (event.type === 'friend-presence') {
    return;
  }
  const channel = runtime.store.upsertChannel({
    id: runtime.store.getChannelByName(event.networkId, event.channel)?.id ?? randomUUID(),
    networkId: event.networkId,
    name: event.channel,
    topic: event.topic,
    users: event.users,
  });
  runtime.send('local', { type: 'buffer.upsert', buffer: runtime.store.getBuffer(channel.id)! });
  runtime.send('local', { type: 'channel.snapshot', channel });
}

const handleStatusEvent = (
  runtime: RuntimeContext,
  event: Extract<RuntimeEvent, { type: 'status' }>
) => {
  const kind: MessageKind = event.kind === 'error'
    ? 'error'
    : event.kind === 'notice'
      ? 'notice'
      : 'system';
  const message: MessageInput = {
    id: randomUUID(),
    networkId: event.networkId,
    target: resolveStatusTarget(runtime.store, event),
    nick: null,
    body: event.message,
    kind,
    self: false,
    ts: Date.now(),
  };
  appendMessage(runtime, message);
  removeFailedChannelJoin(runtime, event);
  if (event.kind !== 'system') {
    runtime.send('local', {
      type: event.kind === 'error' ? 'error' : 'notice',
      networkId: event.networkId,
      message: event.message,
    });
  }
};

const removeFailedChannelJoin = (
  runtime: RuntimeContext,
  event: Extract<RuntimeEvent, { type: 'status' }>
) => {
  if (!event.failedChannelJoinTarget) {
    return;
  }
  if (!event.failedChannelJoinBufferId) {
    return;
  }
  const failedBuffer = runtime.store.getBuffer(event.failedChannelJoinBufferId);
  if (
    failedBuffer?.kind !== 'channel'
    || failedBuffer.networkId !== event.networkId
    || failedBuffer.target !== event.failedChannelJoinTarget
  ) {
    return;
  }
  runtime.store.removeBuffer(failedBuffer.id);
  runtime.send('local', { type: 'buffer.remove', networkId: failedBuffer.networkId, bufferId: failedBuffer.id });
};

const handleMessageEvent = (
  runtime: RuntimeContext,
  event: Extract<RuntimeEvent, { type: 'message' }>
) => {
  const removedChannel = event.message.self && event.message.kind === 'part'
    ? runtime.store.getChannelByName(event.message.networkId, event.message.target)
    : null;

  appendMessage(runtime, event.message);

  const closedServiceQuery = !event.message.self
    && event.message.target === 'server'
    && !!event.message.nick
    && isServiceNick(event.message.nick)
    ? runtime.store.getBufferByTarget(event.message.networkId, event.message.nick)
    : null;

  if (closedServiceQuery?.kind === 'query') {
    runtime.store.removeBuffer(closedServiceQuery.id);
    runtime.send('local', { type: 'buffer.remove', networkId: closedServiceQuery.networkId, bufferId: closedServiceQuery.id });
  }

  if (removedChannel) {
    runtime.store.deleteChannelByName(event.message.networkId, event.message.target);
    runtime.send('local', { type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
  }
};

const appendMessage = (runtime: RuntimeContext, message: MessageInput) => {
  const bufferUpdate = resolveMessageBuffer(runtime, message);
  const saved = runtime.store.appendMessage(message);

  runtime.send('local', { type: 'message.append', message: saved });
  if (bufferUpdate) {
    runtime.send('local', { type: 'buffer.upsert', buffer: bufferUpdate });
  }
};

const resolveStatusTarget = (
  store: Storage,
  event: Extract<RuntimeEvent, { type: 'status' }>
) => {
  if (!event.target || event.target === 'server') {
    return 'server';
  }
  const boundTarget = store.getBufferByTarget(event.networkId, event.target)?.target;
  if (boundTarget) {
    return boundTarget;
  }
  if (isChannelTarget(event.target) || event.requireBoundTarget) {
    return 'server';
  }
  return event.target;
};

const resolveMessageBuffer = (runtime: RuntimeContext, message: MessageInput) => {
  const existing = runtime.store.getBufferByTarget(message.networkId, message.target);
  const created = existing ?? createMessageBuffer(runtime, message);
  if (!created) {
    return null;
  }

  const unread = shouldIncrementUnread(message) ? created.unread + 1 : created.unread;
  if (unread === created.unread) {
    return created;
  }
  runtime.store.setBufferUnread(created.id, unread);
  return runtime.store.getBuffer(created.id);
};

const createMessageBuffer = (runtime: RuntimeContext, message: MessageInput): BufferState | null => {
  if (message.target === 'server') {
    return runtime.store.getServerBuffer(message.networkId)
      ?? runtime.store.upsertBuffer({ networkId: message.networkId, kind: 'server', target: 'server' });
  }
  if (isChannelTarget(message.target)) {
    return runtime.store.upsertBuffer({ networkId: message.networkId, kind: 'channel', target: message.target });
  }
  if (message.kind === 'line') {
    return runtime.store.upsertBuffer({ networkId: message.networkId, kind: 'query', target: message.target });
  }
  return null;
};

const shouldIncrementUnread = (message: MessageInput) =>
  !message.self && (message.target === 'server' || message.kind !== 'system');

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
