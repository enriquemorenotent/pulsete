import type { ChatMessage } from '../../shared/protocol-chat.js';
import type { State } from './app-types.js';

const retainedDistributionLimit = 100;

type MessageTotals = {
  bodyCharacters: number;
  count: number;
  metadataCharacters: number;
};

const emptyMessageTotals = (): MessageTotals => ({
  bodyCharacters: 0,
  count: 0,
  metadataCharacters: 0,
});

const optionalLength = (value: string | null | undefined) => value?.length ?? 0;

const messageMetadataCharacters = (message: ChatMessage) =>
  message.id.length
  + message.bufferId.length
  + message.networkId.length
  + message.target.length
  + optionalLength(message.nick)
  + optionalLength(message.speakerNick)
  + optionalLength(message.importBatchId);

const summarizeMessages = (state: State) => {
  const selectedBufferId = state.transient.selection?.kind === 'buffer'
    ? state.transient.selection.bufferId
    : null;
  const bufferKinds = new Map(
    state.domain.buffers.map((buffer) => [buffer.id, buffer.kind] as const),
  );
  const totals = emptyMessageTotals();
  const byKind: Record<string, number> = {};
  const byDelivery: Record<string, number> = {};
  const retainedByBuffer = Object.entries(state.domain.messages).map(
    ([bufferId, messages]) => {
      const bucket = emptyMessageTotals();
      for (const message of messages) {
        bucket.count += 1;
        bucket.bodyCharacters += message.body.length;
        bucket.metadataCharacters += messageMetadataCharacters(message);
        byKind[message.kind] = (byKind[message.kind] ?? 0) + 1;
        const delivery = message.delivery ?? 'unspecified';
        byDelivery[delivery] = (byDelivery[delivery] ?? 0) + 1;
      }
      totals.count += bucket.count;
      totals.bodyCharacters += bucket.bodyCharacters;
      totals.metadataCharacters += bucket.metadataCharacters;
      return {
        ...bucket,
        bufferKind: bufferKinds.get(bufferId) ?? 'unknown',
        selected: bufferId === selectedBufferId,
      };
    },
  ).sort((left, right) =>
    right.bodyCharacters - left.bodyCharacters
    || right.count - left.count
  );

  return {
    ...totals,
    bucketCount: retainedByBuffer.length,
    byDelivery,
    byKind,
    retainedByBuffer: retainedByBuffer.slice(0, retainedDistributionLimit),
    retainedByBufferOmitted: Math.max(0, retainedByBuffer.length - retainedDistributionLimit),
  };
};

const countBy = <T>(values: readonly T[], readKey: (value: T) => string) => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = readKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const summarizeChannels = (state: State) => {
  const userCounts = state.domain.channels
    .map((channel) => channel.users.length)
    .sort((left, right) => right - left);
  return {
    count: state.domain.channels.length,
    topicCharacters: state.domain.channels.reduce(
      (total, channel) => total + channel.topic.length,
      0,
    ),
    totalUsers: userCounts.reduce((total, count) => total + count, 0),
    usersPerChannel: userCounts.slice(0, retainedDistributionLimit),
    usersPerChannelOmitted: Math.max(0, userCounts.length - retainedDistributionLimit),
  };
};

export const summarizeClientState = (state: State) => {
  const selectedBufferId = state.transient.selection?.kind === 'buffer'
    ? state.transient.selection.bufferId
    : null;
  const selectedBufferKind = selectedBufferId
    ? state.domain.buffers.find((buffer) => buffer.id === selectedBufferId)?.kind ?? 'unknown'
    : null;
  const runtimeStates = Object.values(state.domain.networkStates);
  const capabilities = runtimeStates.reduce(
    (totals, runtime) => ({
      offered: totals.offered + (runtime.capabilities?.offered.length ?? 0),
      negotiated: totals.negotiated + (runtime.capabilities?.negotiated.length ?? 0),
      pending: totals.pending + (runtime.capabilities?.pending.length ?? 0),
      values: totals.values + Object.keys(runtime.capabilities?.values ?? {}).length,
    }),
    { offered: 0, negotiated: 0, pending: 0, values: 0 },
  );

  return {
    phase: state.domain.phase,
    gatewayStatus: state.domain.gatewayStatus,
    networks: {
      count: state.domain.networks.length,
      runtimesByPhase: countBy(runtimeStates, (runtime) => runtime.phase),
      runtimeCapabilities: capabilities,
      workspaceOpen: state.domain.networks.filter((network) => network.workspaceOpen).length,
    },
    buffers: {
      count: state.domain.buffers.length,
      byKind: countBy(state.domain.buffers, (buffer) => buffer.kind),
      totalPriorityUnread: state.domain.buffers.reduce(
        (total, buffer) => total + buffer.priorityUnread,
        0,
      ),
      totalUnread: state.domain.buffers.reduce((total, buffer) => total + buffer.unread, 0),
    },
    channels: summarizeChannels(state),
    pendingChannels: state.domain.pendingChannels.length,
    messages: summarizeMessages(state),
    contacts: {
      friends: state.domain.friends.length,
      mutedNicks: state.domain.mutedNicks.length,
      nickEmojis: state.domain.nickEmojis.length,
      friendPresenceEntries: Object.keys(state.domain.friendPresence).length,
      queryPresenceEntries: Object.keys(state.domain.queryPresence).length,
    },
    selection: {
      kind: state.transient.selection?.kind ?? null,
      selectedBufferKind,
    },
    transient: {
      bannerVisible: state.transient.banner !== null,
      channelListEntries: state.transient.channelList.entries.length,
      channelListOpen: state.transient.channelList.open,
      channelListStatus: state.transient.channelList.status,
      historyHasOlderEntries: Object.keys(state.transient.historyHasOlderByBufferId).length,
      historyLoadedEntries: Object.keys(state.transient.historyLoadedByBufferId).length,
      networkManagerMode: state.transient.networkManager.mode,
    },
  };
};

export const summarizeClientStateForSample = (state: State) => {
  let messageCount = 0;
  let messageBodyCharacters = 0;
  for (const messages of Object.values(state.domain.messages)) {
    messageCount += messages.length;
    for (const message of messages) {
      messageBodyCharacters += message.body.length;
    }
  }
  return {
    buffers: state.domain.buffers.length,
    channels: state.domain.channels.length,
    channelUsers: state.domain.channels.reduce(
      (total, channel) => total + channel.users.length,
      0,
    ),
    messages: messageCount,
    messageBodyCharacters,
    networks: state.domain.networks.length,
  };
};
