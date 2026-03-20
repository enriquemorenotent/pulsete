import { randomUUID } from 'node:crypto';
import type { BufferState, MessageKind, ServerMessage } from '../shared/protocol.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import type { MessageInput, Storage } from './storage.js';

type RuntimeContext = {
  store: Storage;
  send(message: ServerMessage): void;
};

export function handleRuntimeEvent(runtime: RuntimeContext, event: RuntimeEvent): void {
  if (event.type === 'state') {
    runtime.send({
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
  if (event.type === 'channel-pending') {
    runtime.send({
      type: 'channel.pending',
      pendingChannel: { networkId: event.networkId, channel: event.channel },
    });
    return;
  }
  if (event.type === 'channel-pending-remove') {
    runtime.send({ type: 'channel.pending.remove', networkId: event.networkId, channel: event.channel });
    return;
  }
  if (event.type === 'channel-list-entry') {
    runtime.send({
      type: 'channel.list.entry',
      networkId: event.networkId,
      requestId: event.requestId,
      entry: event.entry,
    });
    return;
  }
  if (event.type === 'channel-list-completed') {
    runtime.send({ type: 'channel.list.completed', networkId: event.networkId, requestId: event.requestId });
    return;
  }
  if (event.type === 'channel-list-failed') {
    runtime.send({
      type: 'channel.list.failed',
      networkId: event.networkId,
      requestId: event.requestId,
      message: event.message,
    });
    return;
  }
  if (event.type === 'message') {
    handleMessageEvent(runtime, event);
    return;
  }
  if (event.type === 'friend-presence') {
    return;
  }
  if (event.type !== 'channel') {
    return;
  }
  const channel = runtime.store.upsertChannel({
    id: runtime.store.getChannelByName(event.networkId, event.channel)?.id ?? randomUUID(),
    networkId: event.networkId,
    name: event.channel,
    topic: event.topic,
    users: event.users,
  });
  runtime.send({ type: 'buffer.upsert', buffer: runtime.store.getBuffer(channel.id)! });
  runtime.send({ type: 'channel.snapshot', channel });
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
  if (event.kind !== 'system') {
    runtime.send({
      type: event.kind === 'error' ? 'error' : 'notice',
      networkId: event.networkId,
      message: event.message,
    });
  }
};

const handleMessageEvent = (
  runtime: RuntimeContext,
  event: Extract<RuntimeEvent, { type: 'message' }>
) => {
  const removedChannel = event.message.self && event.message.kind === 'part'
    ? runtime.store.getChannelByName(event.message.networkId, event.message.target)
    : null;
  if (event.message.self && event.message.kind === 'part' && !removedChannel) {
    return;
  }

  appendMessage(runtime, event.message);

  const closedServiceQuery = !event.message.self
    && event.message.target === 'server'
    && !!event.message.nick
    && isServiceNick(event.message.nick)
    ? runtime.store.getBufferByTarget(event.message.networkId, event.message.nick)
    : null;

  if (closedServiceQuery?.kind === 'query') {
    runtime.store.removeBuffer(closedServiceQuery.id);
    runtime.send({ type: 'buffer.remove', networkId: closedServiceQuery.networkId, bufferId: closedServiceQuery.id });
  }

  if (removedChannel) {
    runtime.store.deleteChannelByName(event.message.networkId, event.message.target);
    runtime.send({ type: 'buffer.remove', networkId: removedChannel.networkId, bufferId: removedChannel.id });
  }
};

const appendMessage = (runtime: RuntimeContext, message: MessageInput) => {
  const bufferUpdate = resolveMessageBuffer(runtime, message);
  const saved = runtime.store.appendMessage(message);

  runtime.send({ type: 'message.append', message: saved });
  if (bufferUpdate) {
    runtime.send({ type: 'buffer.upsert', buffer: bufferUpdate });
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
    if (message.self && message.kind === 'part') {
      return null;
    }
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
