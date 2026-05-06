import type { ChatMessage } from '../../shared/protocol-chat.js';
import type { State } from './app-types.js';
import { retainedConversationMessageLimit } from './conversation-message-state.js';
import {
  getBrowserDocument,
  readBrowserHeapSnapshot,
  readUserAgentSpecificMemorySnapshot,
  summarizeDom,
  type BrowserHeapProvider,
  type BrowserHeapSnapshot,
  type DomMemorySnapshot,
  type UserAgentSpecificMemorySnapshot,
} from './memory-browser-metrics.js';
import {
  readMemoryInstrumentationSnapshot,
  type MemoryInstrumentationSnapshot,
} from './memory-instrumentation.js';
export { readBrowserHeapSnapshot } from './memory-browser-metrics.js';

export type ClientMemoryDiagnostics = {
  appState: {
    buffers: number;
    channelListEntries: number;
    channelUsers: number;
    channels: number;
    friendPresenceEntries: number;
    friends: number;
    historyHasOlderBuffers: number;
    historyLoadedBuffers: number;
    messageBuckets: number;
    messages: number;
    messagesAtRetainedLimit: number;
    mutedNicks: number;
    networks: number;
    nickEmojis: number;
    pendingChannels: number;
    queryPresenceEntries: number;
    retainedConversationMessageLimit: number;
    retainedMessageTextBytes: number;
  };
  activity: MemoryInstrumentationSnapshot;
  browserHeap: BrowserHeapSnapshot;
  browserNativeMemory: UserAgentSpecificMemorySnapshot;
  capturedAt: string;
  dom: DomMemorySnapshot;
  largestConversations: ConversationMemorySummary[];
};

export type ConversationMemorySummary = {
  bodyChars: number;
  bufferId: string;
  firstTs: number | null;
  kind: string | null;
  lastTs: number | null;
  messages: number;
  target: string;
  textBytes: number;
};

export const buildClientMemoryDiagnostics = (
  state: State,
  options: {
    document?: Document | null;
    heapProvider?: BrowserHeapProvider | null;
    now?: Date;
  } = {},
): ClientMemoryDiagnostics => {
  const messageSummary = summarizeMessages(state);
  const channels = state.domain.channels;
  return {
    appState: {
      buffers: state.domain.buffers.length,
      channelListEntries: state.transient.channelList.entries.length,
      channelUsers: channels.reduce((total, channel) => total + channel.users.length, 0),
      channels: channels.length,
      friendPresenceEntries: countRecord(state.domain.friendPresence),
      friends: state.domain.friends.length,
      historyHasOlderBuffers: countRecord(state.transient.historyHasOlderByBufferId),
      historyLoadedBuffers: countRecord(state.transient.historyLoadedByBufferId),
      messageBuckets: messageSummary.bucketCount,
      messages: messageSummary.messageCount,
      messagesAtRetainedLimit: messageSummary.messagesAtRetainedLimit,
      mutedNicks: state.domain.mutedNicks.length,
      networks: state.domain.networks.length,
      nickEmojis: state.domain.nickEmojis.length,
      pendingChannels: state.domain.pendingChannels.length,
      queryPresenceEntries: countRecord(state.domain.queryPresence),
      retainedConversationMessageLimit,
      retainedMessageTextBytes: messageSummary.textBytes,
    },
    activity: readMemoryInstrumentationSnapshot(),
    browserHeap: readBrowserHeapSnapshot(options.heapProvider),
    browserNativeMemory: {
      available: false,
      reason: 'Native browser memory was not captured for this synchronous snapshot',
    },
    capturedAt: (options.now ?? new Date()).toISOString(),
    dom: summarizeDom(options.document ?? getBrowserDocument()),
    largestConversations: messageSummary.largestConversations,
  };
};

export const captureClientMemoryDiagnostics = async (
  state: State,
  options: {
    document?: Document | null;
    heapProvider?: BrowserHeapProvider | null;
    now?: Date;
  } = {},
): Promise<ClientMemoryDiagnostics> => ({
  ...buildClientMemoryDiagnostics(state, options),
  browserNativeMemory: await readUserAgentSpecificMemorySnapshot(options.heapProvider),
});

const summarizeMessages = (state: State) => {
  const bufferById = new Map(
    state.domain.buffers.map((buffer) => [buffer.id, buffer]),
  );
  let messageCount = 0;
  let textBytes = 0;
  let messagesAtRetainedLimit = 0;
  const largestConversations: ConversationMemorySummary[] = [];

  for (const [bufferId, messages] of Object.entries(state.domain.messages)) {
    const buffer = bufferById.get(bufferId);
    const summary = summarizeConversation(
      bufferId,
      buffer?.target ?? messages[0]?.target ?? bufferId,
      buffer?.kind ?? null,
      messages,
    );
    messageCount += summary.messages;
    textBytes += summary.textBytes;
    if (summary.messages >= retainedConversationMessageLimit) {
      messagesAtRetainedLimit += 1;
    }
    largestConversations.push(summary);
  }

  largestConversations.sort((left, right) =>
    right.messages - left.messages || right.textBytes - left.textBytes
  );

  return {
    bucketCount: largestConversations.length,
    largestConversations: largestConversations.slice(0, 10),
    messageCount,
    messagesAtRetainedLimit,
    textBytes,
  };
};

const summarizeConversation = (
  bufferId: string,
  target: string,
  kind: string | null,
  messages: readonly ChatMessage[],
): ConversationMemorySummary => {
  let bodyChars = 0;
  let textBytes = 0;
  for (const message of messages) {
    bodyChars += message.body.length;
    textBytes += estimateMessageTextBytes(message);
  }
  return {
    bodyChars,
    bufferId,
    firstTs: messages[0]?.ts ?? null,
    kind,
    lastTs: messages.at(-1)?.ts ?? null,
    messages: messages.length,
    target,
    textBytes,
  };
};

const estimateMessageTextBytes = (message: ChatMessage) =>
  estimateStringBytes(message.id)
  + estimateStringBytes(message.bufferId)
  + estimateStringBytes(message.networkId)
  + estimateStringBytes(message.target)
  + estimateStringBytes(message.nick)
  + estimateStringBytes(message.speakerNick)
  + estimateStringBytes(message.body)
  + estimateStringBytes(message.senderIdentity?.kind)
  + estimateStringBytes(message.senderIdentity?.value);

const estimateStringBytes = (value: string | null | undefined) =>
  (value?.length ?? 0) * 2;

const countRecord = (record: Record<string, unknown>) =>
  Object.keys(record).length;
