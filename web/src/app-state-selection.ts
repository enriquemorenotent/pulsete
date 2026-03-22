import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { Action, AppDomainState, State } from './app-types.js';
import { buildConversationModel, selectionFor } from './conversation-model.js';

export const resolveNextSelection = (
  previous: State,
  domain: AppDomainState,
  action: Action,
) => {
  const selection = action.type === 'select' ? action.selection : previous.transient.selection;
  let conversation: ReturnType<typeof buildConversationModel> | null = null;
  const getConversation = () => {
    if (conversation) {
      return conversation;
    }
    conversation = buildConversationModel({
      buffers: domain.buffers,
      channels: domain.channels,
      pendingChannels: domain.pendingChannels,
    });
    return conversation;
  };

  switch (action.type) {
    case 'snapshot':
      return getConversation().normalizeSelection(domain.networks, previous.transient.selection);
    case 'upsert-buffer':
      if (
        previous.transient.selection?.kind === 'pending-channel'
        && previous.transient.selection.networkId === action.buffer.networkId
        && action.buffer.kind === 'channel'
        && isSameIrcIdentifier(previous.transient.selection.channel, action.buffer.target)
      ) {
        return selectionFor(action.buffer);
      }
      return selection;
    case 'remove-pending-channel':
      if (
        previous.transient.selection?.kind !== 'pending-channel'
        || previous.transient.selection.networkId !== action.networkId
        || !isSameIrcIdentifier(previous.transient.selection.channel, action.channel)
      ) {
        return selection;
      }
      return (
        selectionFor(getConversation().findChannelBuffer(action.networkId, action.channel))
        ?? getConversation().fallbackSelection(domain.networks, action.networkId)
      );
    case 'remove-buffer':
      if (
        previous.transient.selection?.kind === 'buffer'
        && previous.transient.selection.bufferId === action.bufferId
      ) {
        return getConversation().fallbackSelection(domain.networks, action.networkId);
      }
      return selection;
    case 'gateway-disconnected':
      return getConversation().normalizeSelection(domain.networks, previous.transient.selection);
    case 'network-state':
      return action.phase === 'connected'
        ? selection
        : getConversation().normalizeSelection(domain.networks, previous.transient.selection, action.networkId);
    case 'remove-network':
      return getConversation().normalizeSelection(domain.networks, previous.transient.selection);
    default:
      return domain === previous.domain
        ? selection
        : getConversation().normalizeSelection(domain.networks, selection);
  }
};
