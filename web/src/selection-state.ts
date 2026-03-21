import type { BufferState } from '../../shared/protocol.js';
import type { AppDomainState } from './app-types.js';
import { buildConversationIndex } from './conversation-selectors.js';
import { getConnectionInstances } from './workspace-helpers.js';
import type { SelectedBuffer } from './workspace-types.js';

type SelectionDomainState = Pick<AppDomainState, 'buffers' | 'channels' | 'pendingChannels' | 'messages' | 'networks'>;

export type SelectionResolver = {
  conversation: ReturnType<typeof buildConversationIndex>;
  fallbackSelection: (preferredNetworkId?: string | null) => SelectedBuffer | null;
  normalizeSelection: (selection: SelectedBuffer | null, preferredNetworkId?: string | null) => SelectedBuffer | null;
};

export const selectionForBuffer = (buffer: BufferState | null): SelectedBuffer | null =>
  buffer ? { kind: 'buffer', bufferId: buffer.id } : null;

export const createSelectionResolver = (domain: SelectionDomainState): SelectionResolver => {
  const conversation = buildConversationIndex(domain);

  const getSelectionNetworkId = (selection: SelectedBuffer | null) => {
    if (!selection) {
      return null;
    }
    if (selection.kind === 'pending-channel') {
      return selection.networkId;
    }
    return conversation.findBufferById(selection.bufferId)?.networkId ?? null;
  };

  const hasSelection = (selection: SelectedBuffer | null) => {
    if (!selection) {
      return false;
    }
    if (selection.kind === 'pending-channel') {
      return Boolean(conversation.findPendingChannel(selection.networkId, selection.channel));
    }
    return Boolean(conversation.findBufferById(selection.bufferId));
  };

  const selectDefaultBuffer = () => {
    const instance = getConnectionInstances(domain.networks)[0];
    return selectionForBuffer(instance ? conversation.findServerBuffer(instance.id) : null);
  };

  const fallbackSelection = (preferredNetworkId?: string | null) =>
    selectionForBuffer(preferredNetworkId ? conversation.findServerBuffer(preferredNetworkId) : null) ?? selectDefaultBuffer();

  return {
    conversation,
    fallbackSelection,
    normalizeSelection(selection, preferredNetworkId?: string | null) {
      return hasSelection(selection)
        ? selection
        : fallbackSelection(preferredNetworkId ?? getSelectionNetworkId(selection));
    },
  };
};
