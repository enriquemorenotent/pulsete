import type { ServerMessage } from '../shared/protocol-messages.js';
import type { RuntimeEvent } from './irc-types.js';
import { RuntimeConversationService } from './runtime-conversation-service.js';
import type {
  RuntimeConversationStore,
  RuntimeMutedNickStore,
  RuntimeNetworkStore,
} from './runtime-store.js';

type RuntimeEventConversations = Pick<
  RuntimeConversationService,
  | 'handleChannelEvent'
  | 'handleMessageEvent'
  | 'handlePeerNickEvent'
  | 'handlePeerQuitEvent'
  | 'handleSendFailure'
  | 'handleStatusEvent'
>;
type RuntimeEventStore = {
  conversations: RuntimeConversationStore;
  mutedNicks: Pick<RuntimeMutedNickStore, 'list'>;
  networks: Pick<RuntimeNetworkStore, 'get'>;
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
      capabilities: event.capabilities,
    } satisfies ServerMessage];
  }
  if (event.type === 'status') {
    return conversations.handleStatusEvent(event);
  }
  if (event.type === 'send-failed') {
    return conversations.handleSendFailure(event);
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
  if (event.type === 'peer-nick') {
    return conversations.handlePeerNickEvent(event);
  }
  if (event.type === 'peer-quit') {
    return conversations.handlePeerQuitEvent(event);
  }
  if (event.type !== 'channel') {
    return [];
  }
  return conversations.handleChannelEvent(event);
}

export function handleRuntimeEvent(runtime: RuntimeEventSink, event: RuntimeEvent) {
  const conversations = new RuntimeConversationService({
    conversations: runtime.store.conversations,
    mutedNicks: runtime.store.mutedNicks,
    networks: runtime.store.networks,
  });
  for (const message of translateRuntimeEvent(event, conversations)) {
    runtime.publish(message);
  }
}
