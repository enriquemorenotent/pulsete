import type { ServerMessage } from '../../shared/protocol-messages.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type { Action } from './app-types.js';

type Dispatch = (action: Action) => void;

export function dispatchInboundServerMessage(message: ServerMessage, dispatch: Dispatch) {
  for (const action of toActions(message)) {
    dispatch(action);
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
        capabilities: message.capabilities ?? emptyNetworkRuntimeCapabilities(),
      }];
    case 'network.upsert':
      return [{ type: 'upsert-network', network: message.network }];
    case 'network.remove':
      return [{ type: 'remove-network', networkId: message.networkId }];
    case 'friend.upsert':
      return [{ type: 'upsert-friend', friend: message.friend }];
    case 'friend.remove':
      return [{ type: 'remove-friend', friendId: message.friendId }];
    case 'muted-nick.upsert':
      return [{ type: 'upsert-muted-nick', mutedNick: message.mutedNick }];
    case 'muted-nick.remove':
      return [{ type: 'remove-muted-nick', mutedNickId: message.mutedNickId }];
    case 'nick-emoji.upsert':
      return [{ type: 'upsert-nick-emoji', nickEmoji: message.nickEmoji }];
    case 'nick-emoji.remove':
      return [{ type: 'remove-nick-emoji', nickEmojiId: message.nickEmojiId }];
    case 'friend.presence':
      return [{
        type: 'friend-presence',
        friendId: message.friendId,
        presence: message.presence,
      }];
    case 'query.presence':
      return [{
        type: 'query-presence',
        bufferId: message.bufferId,
        presence: message.presence,
      }];
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
        type: 'channel-list-entries',
        networkId: message.networkId,
        requestId: message.requestId,
        entries: [message.entry],
      }];
    case 'channel.list.entries':
      return [{
        type: 'channel-list-entries',
        networkId: message.networkId,
        requestId: message.requestId,
        entries: message.entries,
      }];
    case 'channel.list.completed':
      return [{
        type: 'channel-list-completed',
        networkId: message.networkId,
        requestId: message.requestId,
        totalEntries: message.totalEntries,
        truncated: message.truncated,
      }];
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
