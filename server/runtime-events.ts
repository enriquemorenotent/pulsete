import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import { RuntimeConversations } from './runtime-conversations.js';
import type { Storage } from './storage.js';

type RuntimeContext = {
  store: Storage;
  send(message: ServerMessage): void;
};

export function handleRuntimeEvent(
  runtime: RuntimeContext,
  event: RuntimeEvent,
  conversations?: RuntimeConversations
): void {
  const conversationState = conversations ?? new RuntimeConversations({
    store: runtime.store,
    send: (message) => runtime.send(message),
  });
  if (event.type === 'state') {
    runtime.send({
      type: 'network.state',
      networkId: event.networkId,
      phase: event.phase,
      serverName: event.serverName,
      nick: event.nick,
    });
    return;
  }
  if (event.type === 'status') {
    conversationState.handleStatusEvent(event);
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
    conversationState.handleMessageEvent(event);
    return;
  }
  if (event.type === 'friend-presence') {
    return;
  }
  if (event.type !== 'channel') {
    return;
  }
  conversationState.handleChannelEvent(event);
}
