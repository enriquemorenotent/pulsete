import type { BufferState, ChannelState, ChatMessage, PendingChannelState } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';
import { toConversationMessageKey, type ConversationMessages } from './conversation-message-state.js';
import type { SelectedBuffer } from './workspace-types.js';

type ConversationState = Pick<AppDomainState, 'buffers' | 'channels' | 'pendingChannels'> & {
  messages?: ConversationMessages;
};

export type ConversationIndex = {
  buffersById: ReadonlyMap<string, BufferState>;
  channelsById: ReadonlyMap<string, ChannelState>;
  listBuffersForNetwork: (networkId: string) => BufferState[];
  listPendingChannelsForNetwork: (networkId: string) => PendingChannelState[];
  findBufferById: (bufferId: string) => BufferState | null;
  findServerBuffer: (networkId: string) => BufferState | null;
  findChannelBuffer: (networkId: string, channel: string) => BufferState | null;
  findQueryBuffer: (networkId: string, nick: string) => BufferState | null;
  findPendingChannel: (networkId: string, channel: string) => PendingChannelState | null;
  findSelectedBuffer: (selection: SelectedBuffer | null) => BufferState | null;
  findSelectedPendingChannel: (selection: SelectedBuffer | null) => PendingChannelState | null;
  findChannelByBuffer: (buffer: BufferState | null) => ChannelState | null;
};

export const selectConversationMessages = (
  messages: ConversationMessages,
  buffer: BufferState | null
): ChatMessage[] =>
  buffer ? messages[toConversationMessageKey(buffer.networkId, buffer.target)] ?? [] : [];

export const buildConversationIndex = (state: ConversationState): ConversationIndex => {
  const buffersById = new Map<string, BufferState>();
  const buffersByNetwork = new Map<string, BufferState[]>();
  const serverBuffersByNetwork = new Map<string, BufferState>();
  const channelBuffersByTarget = new Map<string, BufferState>();
  const queryBuffersByTarget = new Map<string, BufferState>();
  const pendingChannelsByNetwork = new Map<string, PendingChannelState[]>();
  const pendingChannelsByTarget = new Map<string, PendingChannelState>();
  const channelsById = new Map<string, ChannelState>();

  for (const buffer of state.buffers) {
    buffersById.set(buffer.id, buffer);
    const buffers = buffersByNetwork.get(buffer.networkId) ?? [];
    buffers.push(buffer);
    buffersByNetwork.set(buffer.networkId, buffers);
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
    const pendingChannels = pendingChannelsByNetwork.get(pendingChannel.networkId) ?? [];
    pendingChannels.push(pendingChannel);
    pendingChannelsByNetwork.set(pendingChannel.networkId, pendingChannels);
    pendingChannelsByTarget.set(
      toConversationMessageKey(pendingChannel.networkId, pendingChannel.channel),
      pendingChannel
    );
  }

  for (const channel of state.channels) {
    channelsById.set(channel.id, channel);
  }

  const findSelectedBuffer = (selection: SelectedBuffer | null) =>
    selection?.kind === 'buffer' ? buffersById.get(selection.bufferId) ?? null : null;

  const findSelectedPendingChannel = (selection: SelectedBuffer | null) =>
    selection?.kind === 'pending-channel'
      ? pendingChannelsByTarget.get(toConversationMessageKey(selection.networkId, selection.channel)) ?? null
      : null;

  return {
    buffersById,
    channelsById,
    listBuffersForNetwork: (networkId: string) => buffersByNetwork.get(networkId) ?? [],
    listPendingChannelsForNetwork: (networkId: string) => pendingChannelsByNetwork.get(networkId) ?? [],
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
  };
};
