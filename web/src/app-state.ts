import type { AppSnapshot } from '../../shared/protocol-app.js';
import type { BufferState } from '../../shared/protocol-chat.js';
import { emptyNetworkRuntimeCapabilities } from '../../shared/protocol-chat.js';
import type { AppDomainState, AppTransientState } from './app-types.js';
import {
  indexConversationMessages,
  retainConversationMessageBudget,
  type ConversationMessages,
} from './conversation-message-state.js';
import {
  reduceConversationDomain,
  sortBuffers,
  sortFriends,
  sortMutedNicks,
  sortNickEmojis,
  sortPendingChannels,
} from './app-state-conversations.js';
import { initialChannelListState } from './app-state-channel-list.js';
import { resolveNextSelection } from './app-state-selection.js';
import { reduceRuntimeDomain } from './app-state-runtime.js';
import { initialNetworkManagerState, reduceTransientAction } from './app-state-ui.js';
import type { Action, State } from './app-types.js';
import { defaultWorkspacePreferences } from '../../shared/protocol-preferences.js';

export { initialChannelListState } from './app-state-channel-list.js';

const initialDomainState: AppDomainState = {
  phase: 'loading',
  gatewayStatus: 'connecting',
  networks: [],
  friends: [],
  mutedNicks: [],
  nickEmojis: [],
  friendPresence: {},
  queryPresence: {},
  buffers: [],
  channels: [],
  pendingChannels: [],
  messages: {},
  pinnedMessages: {},
  networkStates: {},
  preferences: defaultWorkspacePreferences,
  userAvatarOverrides: [],
  drafts: [],
  browserStorageImportPending: false,
};

const initialTransientState: AppTransientState = {
  selection: null,
  banner: null,
  channelList: initialChannelListState,
  historyLoadedByBufferId: {},
  historyHasOlderByBufferId: {},
  historyHasNewerByBufferId: {},
  pinnedMessagesLoadedByBufferId: {},
  messageFocusRequest: null,
  networkManager: initialNetworkManagerState,
};

export const initialState: State = {
  domain: initialDomainState,
  transient: initialTransientState,
};

const reduceSnapshotDomain = (state: State, snapshot: AppSnapshot) => ({
  phase: 'ready' as const,
  gatewayStatus: state.domain.gatewayStatus,
  networks: snapshot.networks,
  friends: sortFriends(snapshot.friends),
  mutedNicks: sortMutedNicks(snapshot.mutedNicks),
  nickEmojis: sortNickEmojis(snapshot.nickEmojis),
  friendPresence: snapshot.friendPresence,
  queryPresence: snapshot.queryPresence,
  buffers: sortBuffers(snapshot.buffers),
  channels: snapshot.channels,
  pendingChannels: sortPendingChannels(snapshot.pendingChannels),
  messages: indexConversationMessages(snapshot.messages),
  pinnedMessages: {},
  networkStates: Object.fromEntries(
    Object.entries(snapshot.networkStates).map(([networkId, runtime]) => [
      networkId,
      {
        ...runtime,
        capabilities: runtime.capabilities ?? emptyNetworkRuntimeCapabilities(),
      },
    ]),
  ),
  preferences: snapshot.preferences,
  userAvatarOverrides: snapshot.userAvatarOverrides,
  drafts: snapshot.drafts,
  browserStorageImportPending: snapshot.browserStorageImportPending,
});

export const reducer = (state: State, action: Action): State => {
  const selectedBufferId = state.transient.selection?.kind === 'buffer'
    ? state.transient.selection.bufferId
    : null;
  const suppressHistoricalAppend = action.type === 'append-message'
    && state.transient.historyHasNewerByBufferId[action.message.bufferId] === true;
  const reducedDomain = action.type === 'snapshot'
    ? reduceSnapshotDomain(state, action.snapshot)
    : suppressHistoricalAppend
      ? state.domain
      : reduceRuntimeDomain(state.domain, action)
      ?? reduceConversationDomain(state.domain, action, selectedBufferId)
      ?? state.domain;
  const selection = resolveNextSelection(state, reducedDomain, action);
  const nextSelectedBufferId = selection?.kind === 'buffer' ? selection.bufferId : null;
  const messages = retainConversationMessageBudget(
    reducedDomain.messages,
    nextSelectedBufferId,
  );
  const trimmedBufferIds = findTrimmedMessageBuffers(reducedDomain.messages, messages);
  if (isMessageRetentionAction(action)) {
    findTrimmedMessageBuffers(state.domain.messages, reducedDomain.messages, trimmedBufferIds);
  }
  const domain = messages === reducedDomain.messages
    ? reducedDomain
    : { ...reducedDomain, messages };
  const transientBase = action.type === 'snapshot'
    ? {
        ...state.transient,
        selection,
        banner: null,
        channelList: initialChannelListState,
        historyLoadedByBufferId: {},
        historyHasOlderByBufferId: {},
        historyHasNewerByBufferId: {},
        pinnedMessagesLoadedByBufferId: {},
        messageFocusRequest: null,
      }
    : selection === state.transient.selection
      ? state.transient
      : { ...state.transient, selection };
  const reducedTransient = action.type === 'snapshot'
    ? transientBase
    : reduceTransientAction(transientBase, action) ?? transientBase;
  const prunedTransient =
    domain.buffers === state.domain.buffers
      ? reducedTransient
      : pruneTransientBufferHistory(reducedTransient, domain.buffers);
  const transient = reconcileRetainedMessageHistory(
    prunedTransient,
    domain.messages,
    trimmedBufferIds,
  );

  if (domain === state.domain && transient === state.transient) {
    return state;
  }
  return { domain, transient };
};

const isMessageRetentionAction = (action: Action) =>
  action.type === 'append-message'
  || action.type === 'upsert-message'
  || action.type === 'append-messages'
  || action.type === 'prepend-messages';

const findTrimmedMessageBuffers = (
  before: ConversationMessages,
  after: ConversationMessages,
  trimmed = new Set<string>(),
) => {
  if (before === after) {
    return trimmed;
  }
  for (const [bufferId, bucket] of Object.entries(before)) {
    const retained = after[bufferId];
    if (bucket === retained) {
      continue;
    }
    const oldestMessageId = bucket[0]?.id;
    if (oldestMessageId && (!retained || !retained.some(({ id }) => id === oldestMessageId))) {
      trimmed.add(bufferId);
    }
  }
  return trimmed;
};

const reconcileRetainedMessageHistory = (
  transient: AppTransientState,
  messages: ConversationMessages,
  trimmedBufferIds: ReadonlySet<string>,
) => {
  let historyLoadedByBufferId = transient.historyLoadedByBufferId;
  let historyHasOlderByBufferId = transient.historyHasOlderByBufferId;
  for (const bufferId of trimmedBufferIds) {
    if (!messages[bufferId]) {
      if (bufferId in historyLoadedByBufferId) {
        historyLoadedByBufferId = { ...historyLoadedByBufferId };
        delete historyLoadedByBufferId[bufferId];
      }
      if (bufferId in historyHasOlderByBufferId) {
        historyHasOlderByBufferId = { ...historyHasOlderByBufferId };
        delete historyHasOlderByBufferId[bufferId];
      }
    } else if (historyHasOlderByBufferId[bufferId] !== true) {
      historyHasOlderByBufferId = { ...historyHasOlderByBufferId, [bufferId]: true };
    }
  }
  if (
    historyLoadedByBufferId === transient.historyLoadedByBufferId
    && historyHasOlderByBufferId === transient.historyHasOlderByBufferId
  ) {
    return transient;
  }
  return { ...transient, historyLoadedByBufferId, historyHasOlderByBufferId };
};

const pruneTransientBufferHistory = (
  transient: AppTransientState,
  buffers: readonly BufferState[],
): AppTransientState => {
  const activeBufferIds = new Set(buffers.map((buffer) => buffer.id));
  const historyLoadedByBufferId = retainActiveBufferKeys(
    transient.historyLoadedByBufferId,
    activeBufferIds,
  );
  const historyHasOlderByBufferId = retainActiveBufferKeys(
    transient.historyHasOlderByBufferId,
    activeBufferIds,
  );
  const historyHasNewerByBufferId = retainActiveBufferKeys(
    transient.historyHasNewerByBufferId,
    activeBufferIds,
  );
  const pinnedMessagesLoadedByBufferId = retainActiveBufferKeys(
    transient.pinnedMessagesLoadedByBufferId,
    activeBufferIds,
  );
  const messageFocusRequest = transient.messageFocusRequest
    && activeBufferIds.has(transient.messageFocusRequest.bufferId)
    ? transient.messageFocusRequest
    : null;
  if (
    historyLoadedByBufferId === transient.historyLoadedByBufferId
    && historyHasOlderByBufferId === transient.historyHasOlderByBufferId
    && historyHasNewerByBufferId === transient.historyHasNewerByBufferId
    && pinnedMessagesLoadedByBufferId === transient.pinnedMessagesLoadedByBufferId
    && messageFocusRequest === transient.messageFocusRequest
  ) {
    return transient;
  }
  return {
    ...transient,
    historyLoadedByBufferId,
    historyHasOlderByBufferId,
    historyHasNewerByBufferId,
    pinnedMessagesLoadedByBufferId,
    messageFocusRequest,
  };
};

const retainActiveBufferKeys = <T extends Record<string, unknown>>(
  map: T,
  activeBufferIds: ReadonlySet<string>,
): T => {
  let changed = false;
  const entries = Object.entries(map).filter(([bufferId]) => {
    const keep = activeBufferIds.has(bufferId);
    changed ||= !keep;
    return keep;
  });
  return changed ? Object.fromEntries(entries) as T : map;
};
