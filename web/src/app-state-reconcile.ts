import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { Action, State } from './app-types.js';
import { createSelectionResolver } from './selection-state.js';

export const reconcileState = (previous: State, next: State, action: Action): State => {
  const selection = resolveSelection(previous, next, action);
  if (selection === next.transient.selection) {
    return next;
  }
  return {
    ...next,
    transient: {
      ...next.transient,
      selection,
    },
  };
};

const resolveSelection = (previous: State, next: State, action: Action) => {
  const resolver = createSelectionResolver(next.domain);

  switch (action.type) {
    case 'snapshot':
      return resolver.normalizeSelection(previous.transient.selection);
    case 'upsert-buffer':
      if (
        previous.transient.selection?.kind === 'pending-channel'
        && previous.transient.selection.networkId === action.buffer.networkId
        && action.buffer.kind === 'channel'
        && isSameIrcIdentifier(previous.transient.selection.channel, action.buffer.target)
      ) {
        return { kind: 'buffer' as const, bufferId: action.buffer.id };
      }
      return next.transient.selection;
    case 'remove-pending-channel':
      if (
        previous.transient.selection?.kind !== 'pending-channel'
        || previous.transient.selection.networkId !== action.networkId
        || !isSameIrcIdentifier(previous.transient.selection.channel, action.channel)
      ) {
        return next.transient.selection;
      }
      {
        const buffer = resolver.conversation.findChannelBuffer(action.networkId, action.channel);
        return buffer
          ? { kind: 'buffer' as const, bufferId: buffer.id }
          : resolver.fallbackSelection(action.networkId);
      }
    case 'remove-buffer':
      if (
        previous.transient.selection?.kind === 'buffer'
        && previous.transient.selection.bufferId === action.bufferId
      ) {
        return resolver.fallbackSelection(action.networkId);
      }
      return next.transient.selection;
    case 'gateway-disconnected':
      return resolver.normalizeSelection(previous.transient.selection);
    case 'network-state':
      return action.phase === 'connected'
        ? next.transient.selection
        : resolver.normalizeSelection(previous.transient.selection, action.networkId);
    case 'remove-network':
      return resolver.normalizeSelection(previous.transient.selection);
    default:
      return next.domain === previous.domain
        ? next.transient.selection
        : resolver.normalizeSelection(next.transient.selection);
  }
};
