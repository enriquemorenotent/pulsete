import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import { RuntimeConversations } from './runtime-conversations.js';
import type { Storage } from './storage.js';

type RuntimeContext = {
  store: Storage;
  send?(message: ServerMessage): void;
};

export function handleRuntimeEvent(
  runtime: RuntimeContext,
  event: RuntimeEvent,
  conversations?: RuntimeConversations
): ServerMessage[] {
  const conversationState = conversations ?? new RuntimeConversations(runtime.store);
  const publish = (messages: ServerMessage[]) => {
    runtime.send?.(messages[0]!);
    if (messages.length > 1) {
      for (const message of messages.slice(1)) {
        runtime.send?.(message);
      }
    }
    return messages;
  };
  if (event.type === 'state') {
    return publish([{
      type: 'network.state',
      networkId: event.networkId,
      phase: event.phase,
      serverName: event.serverName,
      nick: event.nick,
    } satisfies ServerMessage]);
  }
  if (event.type === 'status') {
    return publish(conversationState.handleStatusEvent(event));
  }
  if (event.type === 'channel-pending') {
    return publish([{
      type: 'channel.pending',
      pendingChannel: { networkId: event.networkId, channel: event.channel },
    } satisfies ServerMessage]);
  }
  if (event.type === 'channel-pending-remove') {
    return publish([{ type: 'channel.pending.remove', networkId: event.networkId, channel: event.channel } satisfies ServerMessage]);
  }
  if (event.type === 'channel-list-entry') {
    return publish([{
      type: 'channel.list.entry',
      networkId: event.networkId,
      requestId: event.requestId,
      entry: event.entry,
    } satisfies ServerMessage]);
  }
  if (event.type === 'channel-list-completed') {
    return publish([{ type: 'channel.list.completed', networkId: event.networkId, requestId: event.requestId } satisfies ServerMessage]);
  }
  if (event.type === 'channel-list-failed') {
    return publish([{
      type: 'channel.list.failed',
      networkId: event.networkId,
      requestId: event.requestId,
      message: event.message,
    } satisfies ServerMessage]);
  }
  if (event.type === 'message') {
    return publish(conversationState.handleMessageEvent(event));
  }
  if (event.type === 'friend-presence') {
    return [];
  }
  if (event.type !== 'channel') {
    return [];
  }
  return publish(conversationState.handleChannelEvent(event));
}
