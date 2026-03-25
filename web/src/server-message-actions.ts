import type { ServerMessage } from '../../shared/protocol.js';
import type { Action } from './app-types.js';

type Dispatch = (action: Action) => void;

export function dispatchInboundServerMessage(message: ServerMessage, dispatch: Dispatch) {
  for (const action of toActions(message)) {
    dispatch(action);
  }
}

export function dispatchInboundServerMessages(messages: readonly ServerMessage[], dispatch: Dispatch) {
  for (const message of messages) {
    dispatchInboundServerMessage(message, dispatch);
  }
}

const toActions = (message: ServerMessage): Action[] => {
  switch (message.type) {
    case 'state.ready':
      return [
        { type: 'gateway-connected' },
        { type: 'snapshot', snapshot: message.snapshot },
      ];
    case 'network.state':
      return [{
        type: 'network-state',
        networkId: message.networkId,
        phase: message.phase,
        serverName: message.serverName,
        nick: message.nick,
      }];
    case 'network.upsert':
      return [{ type: 'upsert-network', network: message.network }];
    case 'network.remove':
      return [{ type: 'remove-network', networkId: message.networkId }];
    case 'friend.upsert':
      return [{ type: 'upsert-friend', friend: message.friend }];
    case 'friend.remove':
      return [{ type: 'remove-friend', friendId: message.friendId }];
    case 'friend.presence':
      return [{ type: 'friend-presence', friendId: message.friendId, online: message.online }];
    case 'buffer.upsert':
      return [{ type: 'upsert-buffer', buffer: message.buffer }];
    case 'buffer.remove':
      return [{ type: 'remove-buffer', networkId: message.networkId, bufferId: message.bufferId }];
    case 'channel.snapshot':
      return [{ type: 'upsert-channel', channel: message.channel }];
    case 'channel.pending':
      return [{ type: 'add-pending-channel', pendingChannel: message.pendingChannel }];
    case 'channel.pending.remove':
      return [{ type: 'remove-pending-channel', networkId: message.networkId, channel: message.channel }];
    case 'channel.list.started':
      return [{ type: 'channel-list-started', networkId: message.networkId, requestId: message.requestId }];
    case 'channel.list.entry':
      return [{
        type: 'channel-list-entry',
        networkId: message.networkId,
        requestId: message.requestId,
        entry: message.entry,
      }];
    case 'channel.list.completed':
      return [{ type: 'channel-list-completed', networkId: message.networkId, requestId: message.requestId }];
    case 'channel.list.failed':
      return [{
        type: 'channel-list-failed',
        networkId: message.networkId,
        requestId: message.requestId,
        message: message.message,
      }];
    case 'message.append':
      return [{ type: 'append-message', message: message.message }];
    case 'message.upsert':
      return [{ type: 'upsert-message', message: message.message }];
    case 'message.remove':
      return [{
        type: 'remove-messages',
        networkId: message.networkId,
        target: message.target,
        messageIds: message.messageIds,
      }];
    case 'assistant.snapshot':
      return [{ type: 'assistant-snapshot', assistant: message.assistant }];
    case 'assistant.thread.loaded':
      return [{ type: 'assistant-thread-loaded', thread: message.thread }];
    case 'assistant.turn.started':
      return [{ type: 'assistant-turn-started', threadId: message.threadId, turn: message.turn }];
    case 'assistant.turn.completed':
      return [{ type: 'assistant-turn-completed', threadId: message.threadId, turn: message.turn }];
    case 'assistant.item.started':
      return [{
        type: 'assistant-item-started',
        threadId: message.threadId,
        turnId: message.turnId,
        item: message.item,
      }];
    case 'assistant.item.delta':
      return [{
        type: 'assistant-item-delta',
        threadId: message.threadId,
        turnId: message.turnId,
        itemId: message.itemId,
        delta: message.delta,
      }];
    case 'assistant.item.completed':
      return [{
        type: 'assistant-item-completed',
        threadId: message.threadId,
        turnId: message.turnId,
        item: message.item,
      }];
    case 'presence.update':
      return [{
        type: 'update-presence',
        networkId: message.networkId,
        channel: message.channel,
        users: message.users,
      }];
    case 'notice':
    case 'error':
      return [{ type: 'set-banner', banner: { kind: message.type, message: message.message } }];
  }
};
