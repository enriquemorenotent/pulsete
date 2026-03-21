import type { BufferState, ChannelState, ChatMessage, PendingChannelState } from '../../shared/protocol.js';
import type { State } from './app-types.js';
import { toConversationMessageKey, type ConversationMessages } from './conversation-message-state.js';
import type { SelectedBuffer } from './workspace-types.js';

type ConversationState = Pick<State, 'buffers' | 'channels' | 'pendingChannels'> & {
  messages: ConversationMessages;
};

export const createConversationQueries = (state: ConversationState) => {
  const buffersById = new Map<string, BufferState>();
  const serverBuffersByNetwork = new Map<string, BufferState>();
  const channelBuffersByTarget = new Map<string, BufferState>();
  const queryBuffersByTarget = new Map<string, BufferState>();
  const pendingChannelsByTarget = new Map<string, PendingChannelState>();
  const channelsById = new Map<string, ChannelState>();
  const messagesByTarget = new Map<string, ChatMessage[]>();

  for (const buffer of state.buffers) {
    buffersById.set(buffer.id, buffer);
    if (buffer.kind === 'server') {
      serverBuffersByNetwork.set(buffer.networkId, buffer);
      continue;
    }
    const key = toConversationMessageKey(buffer.networkId, buffer.target);
    if (buffer.kind === 'channel') {
      channelBuffersByTarget.set(key, buffer);
      continue;
    }
    queryBuffersByTarget.set(key, buffer);
  }

  for (const pendingChannel of state.pendingChannels) {
    pendingChannelsByTarget.set(
      toConversationMessageKey(pendingChannel.networkId, pendingChannel.channel),
      pendingChannel
    );
  }

  for (const channel of state.channels) {
    channelsById.set(channel.id, channel);
  }

  for (const [key, messages] of Object.entries(state.messages)) {
    messagesByTarget.set(key, messages);
  }

  const findSelectedBuffer = (selection: SelectedBuffer | null) =>
    selection?.kind === 'buffer' ? buffersById.get(selection.bufferId) ?? null : null;

  const findSelectedPendingChannel = (selection: SelectedBuffer | null) =>
    selection?.kind === 'pending-channel'
      ? pendingChannelsByTarget.get(toConversationMessageKey(selection.networkId, selection.channel)) ?? null
      : null;

  return {
    findBufferById: (bufferId: string) => buffersById.get(bufferId) ?? null,
    findServerBuffer: (networkId: string) => serverBuffersByNetwork.get(networkId) ?? null,
    findChannelBuffer: (networkId: string, channel: string) =>
      channelBuffersByTarget.get(toConversationMessageKey(networkId, channel)) ?? null,
    findQueryBuffer: (networkId: string, nick: string) =>
      queryBuffersByTarget.get(toConversationMessageKey(networkId, nick)) ?? null,
    findPendingChannel: (networkId: string, channel: string) =>
      pendingChannelsByTarget.get(toConversationMessageKey(networkId, channel)) ?? null,
    findSelectedBuffer,
    findSelectedPendingChannel,
    findChannelByBuffer: (buffer: BufferState | null) =>
      buffer?.kind === 'channel' ? channelsById.get(buffer.id) ?? null : null,
    selectMessages: (buffer: BufferState | null) =>
      buffer ? messagesByTarget.get(toConversationMessageKey(buffer.networkId, buffer.target)) ?? [] : [],
  };
};
