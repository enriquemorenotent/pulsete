import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import type { StorageConversationsRepository } from './storage-conversations-repository.js';
import type { StorageNetworksRepository } from './storage-networks-repository.js';

type RuntimeEventConversations = Pick<RuntimeConversationService, 'handleChannelEvent' | 'handleMessageEvent' | 'handleStatusEvent'>;
type RuntimeEventStore = {
  conversations: StorageConversationsRepository;
  networks: StorageNetworksRepository;
};
type RuntimeEventSink = {
  publish(message: ServerMessage): void;
  store: RuntimeEventStore;
};

export function translateRuntimeEvent(
  event: RuntimeEvent,
  conversations: RuntimeEventConversations
): ServerMessage[] {
  if (event.type === 'state') {
    return [{
      type: 'network.state',
      networkId: event.networkId,
      phase: event.phase,
      serverName: event.serverName,
      nick: event.nick,
    } satisfies ServerMessage];
  }
  if (event.type === 'status') {
    return conversations.handleStatusEvent(event);
  }
  if (event.type === 'channel-pending') {
    return [{
      type: 'channel.pending',
      pendingChannel: { networkId: event.networkId, channel: event.channel },
    } satisfies ServerMessage];
  }
  if (event.type === 'channel-pending-remove') {
    return [{ type: 'channel.pending.remove', networkId: event.networkId, channel: event.channel } satisfies ServerMessage];
  }
  if (event.type === 'message') {
    return conversations.handleMessageEvent(event);
  }
  if (event.type !== 'channel') {
    return [];
  }
  return conversations.handleChannelEvent(event);
}

export function handleRuntimeEvent(runtime: RuntimeEventSink, event: RuntimeEvent) {
  const conversations = new RuntimeConversationService({
    conversations: runtime.store.conversations,
    networks: runtime.store.networks,
  });
  for (const message of translateRuntimeEvent(event, conversations)) {
    runtime.publish(message);
  }
}
