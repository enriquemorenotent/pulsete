import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '../shared/protocol.js';
import { isServiceNick } from './irc-services.js';
import type { RuntimeEvent } from './irc-types.js';
import type { Storage } from './storage.js';

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
  const channel = runtime.store.upsertChannel({
    id: randomUUID(),
    networkId: event.networkId,
    name: event.channel,
    topic: event.topic,
    unread: runtime.store.getChannelByName(event.networkId, event.channel)?.unread ?? 0,
    users: event.users,
  });
  runtime.send('local', { type: 'channel.snapshot', channel });
}

const handleStatusEvent = (
  runtime: RuntimeContext,
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
  runtime.store.appendMessage(message);
  if (event.kind !== 'system') {
    runtime.send('local', {
      type: event.kind === 'error' ? 'error' : 'notice',
      networkId: event.networkId,
      message: event.message,
    });
  }
  runtime.send('local', { type: 'message.append', message });
};

const handleMessageEvent = (
  runtime: RuntimeContext,
  event: Extract<RuntimeEvent, { type: 'message' }>
) => {
  const removedChannel = event.message.self && event.message.kind === 'part'
    ? runtime.store.getChannelByName(event.message.networkId, event.message.target)
    : null;
  const query = !event.message.self
    && event.message.kind === 'line'
    && event.message.target !== 'server'
    && !isChannelTarget(event.message.target)
    ? runtime.store.upsertQuery(event.message.networkId, event.message.target)
    : null;
  const serviceNick = !event.message.self
    && event.message.target === 'server'
    && isServiceNick(event.message.nick)
    ? event.message.nick
    : null;
  const closedServiceQuery = serviceNick && runtime.store.getQuery(event.message.networkId, serviceNick)
    ? serviceNick
    : null;
  const saved = runtime.store.appendMessage(event.message);
  let unreadChannel = null;
  if (!event.message.self && event.message.target !== 'server' && event.message.kind !== 'system') {
    const channel = runtime.store.getChannelByName(event.message.networkId, event.message.target);
    if (channel) {
      runtime.store.setChannelUnread(event.message.networkId, event.message.target, channel.unread + 1);
      unreadChannel = runtime.store.getChannelByName(event.message.networkId, event.message.target);
    }
  }
  if (removedChannel) {
    runtime.store.deleteChannelByName(event.message.networkId, event.message.target);
  }
  runtime.send('local', { type: 'message.append', message: saved });
  if (unreadChannel) {
    runtime.send('local', { type: 'channel.snapshot', channel: unreadChannel });
  }
  if (query) {
    runtime.send('local', { type: 'query.open', query });
  }
  if (closedServiceQuery) {
    runtime.store.deleteQuery(event.message.networkId, closedServiceQuery);
    runtime.send('local', { type: 'query.close', networkId: event.message.networkId, target: closedServiceQuery });
  }
  if (removedChannel) {
    runtime.send('local', {
      type: 'channel.remove',
      networkId: removedChannel.networkId,
      channelId: removedChannel.id,
      channel: removedChannel.name,
    });
  }
};

const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
