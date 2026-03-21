import type { ServerMessage } from '../shared/protocol.js';
import type { RuntimeEvent } from './irc-types.js';
import type { RuntimeConversationProjector } from './runtime-conversation-projector.js';
import { RuntimeConversationProjector as RuntimeConversationStore } from './runtime-conversation-projector.js';
import type { Storage } from './storage.js';

type RuntimeEventConversations = Pick<RuntimeConversationProjector, 'handleChannelEvent' | 'handleMessageEvent' | 'handleStatusEvent'>;
type RuntimeEventSink = {
  store: Storage;
  send(message: ServerMessage): void;
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
  const conversations = new RuntimeConversationStore(runtime.store);
  for (const message of translateRuntimeEvent(event, conversations)) {
    runtime.send(message);
  }
}
