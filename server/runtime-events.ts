import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import type { Storage } from './storage.js';

type RuntimeContext = {
  store: Storage;
  send(userId: string, message: ServerMessage): void;
};

export const handleRuntimeEvent = (runtime: RuntimeContext, userId: string, event: RuntimeEvent) => {
  if (event.type === 'state') {
    runtime.send(userId, {
      type: 'network.state',
      networkId: event.networkId,
      connected: event.connected,
      serverName: event.serverName,
      nick: event.nick,
    });
    return;
  }
  if (event.type === 'status') {
    handleStatusEvent(runtime, userId, event);
    return;
  }
  if (event.type === 'message') {
    handleMessageEvent(runtime, userId, event);
    return;
  }
  const channel = runtime.store.upsertChannel(userId, {
    id: randomUUID(),
    networkId: event.networkId,
    name: event.channel,
    topic: event.topic,
    unread: runtime.store.getChannelByName(userId, event.networkId, event.channel)?.unread ?? 0,
    users: event.users,
  });
  runtime.send(userId, { type: 'channel.snapshot', channel });
};

const handleStatusEvent = (
  runtime: RuntimeContext,
  userId: string,
  event: Extract<RuntimeEvent, { type: 'status' }>
) => {
  const message = {
    id: randomUUID(),
    networkId: event.networkId,
    target: 'server',
    nick: null,
    body: event.message,
    kind: 'system' as const,
    self: false,
    ts: Date.now(),
  };
  runtime.store.appendMessage(userId, message);
  runtime.send(userId, {
    type: event.kind === 'error' ? 'error' : 'notice',
    networkId: event.networkId,
    message: event.message,
  });
  runtime.send(userId, { type: 'message.append', message });
};

const handleMessageEvent = (
  runtime: RuntimeContext,
  userId: string,
  event: Extract<RuntimeEvent, { type: 'message' }>
) => {
  const removedChannel = event.message.self && event.message.kind === 'part'
    ? runtime.store.getChannelByName(userId, event.message.networkId, event.message.target)
    : null;
  const query = event.message.kind === 'line' && event.message.target !== 'server' && !isChannelTarget(event.message.target)
    ? runtime.store.upsertQuery(userId, event.message.networkId, event.message.target)
    : null;
  const saved = runtime.store.appendMessage(userId, event.message);
  let unreadChannel = null;
  if (!event.message.self && event.message.target !== 'server' && event.message.kind !== 'system') {
    const channel = runtime.store.getChannelByName(userId, event.message.networkId, event.message.target);
    if (channel) {
      runtime.store.setChannelUnread(userId, event.message.networkId, event.message.target, channel.unread + 1);
      unreadChannel = runtime.store.getChannelByName(userId, event.message.networkId, event.message.target);
    }
  }
  if (removedChannel) {
    runtime.store.deleteChannelByName(userId, event.message.networkId, event.message.target);
  }
  runtime.send(userId, { type: 'message.append', message: saved });
  if (unreadChannel) {
    runtime.send(userId, { type: 'channel.snapshot', channel: unreadChannel });
  }
  if (query) {
    runtime.send(userId, { type: 'query.open', query });
  }
  if (removedChannel) {
    runtime.send(userId, {
      type: 'channel.remove',
      networkId: removedChannel.networkId,
      channelId: removedChannel.id,
      channel: removedChannel.name,
    });
  }
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
