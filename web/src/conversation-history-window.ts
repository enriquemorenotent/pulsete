import type { Action, State } from './app-types.js';
import { selectedConversationMessageLimit } from './conversation-message-retention.js';

type HistoryPageAction = Extract<Action, { type: 'page-message-window' }>;

// Merge against current state so messages received while a page was loading survive.
export function resolveHistoryPageAction(state: State, action: HistoryPageAction): Action | null {
  const selection = state.transient.selection;
  const current = state.domain.messages[action.bufferId] ?? [];
  const older = action.direction === 'older';
  if (selection?.kind !== 'buffer' || selection.bufferId !== action.bufferId
    || (older ? current[0] : current.at(-1))?.id !== action.cursor) return null;
  const ids = new Set(current.map(({ id }) => id));
  const incoming = action.messages.filter((message) => {
    if (message.bufferId !== action.bufferId || ids.has(message.id)) return false;
    ids.add(message.id);
    return true;
  });
  const merged = older ? [...incoming, ...current] : [...current, ...incoming];
  const trimmed = merged.length > selectedConversationMessageLimit;
  const messages = older
    ? merged.slice(0, selectedConversationMessageLimit)
    : merged.slice(-selectedConversationMessageLimit);
  return {
    type: 'replace-message-window', bufferId: action.bufferId, messages,
    hasOlder: older ? action.hasMore : trimmed || state.transient.historyHasOlderByBufferId[action.bufferId] === true,
    hasNewer: older ? trimmed || state.transient.historyHasNewerByBufferId[action.bufferId] === true : action.hasMore,
  };
}
