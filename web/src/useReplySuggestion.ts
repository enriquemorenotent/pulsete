import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { isIncomingReplySuggestionText } from '../../shared/reply-suggestion.js';
import { isSameIrcIdentifier } from '../../shared/irc-identifiers.js';
import type { ChatMessage } from '../../shared/protocol-chat.js';
import { isMessageMuted } from './muted-nick-utils.js';
import { selectWorkspace } from './app-selectors.js';
import type { State } from './app-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import { aiAssistantApi } from './ai-assistant-client.js';
import type { AppStoreApi } from './app-store.js';

export function selectReplySuggestionBuffer(state: State) {
  if (!state.domain.preferences.aiReplySuggestionsEnabled || state.domain.gatewayStatus !== 'connected') return null;
  const workspace = selectWorkspace(state);
  const buffer = workspace.selectedBuffer;
  return buffer?.kind === 'query' && workspace.selectedRuntime?.phase === 'connected'
    && workspace.composerMode === 'normal' && !workspace.composerDisabled
    && !state.transient.historyHasNewerByBufferId[buffer.id] ? buffer.id : null;
}

const isWindowActive = () => document.visibilityState === 'visible' && document.hasFocus();

type ReplySuggestionOptions = {
  bufferId: string | null;
  canSuggest: boolean;
  composer: Pick<ComposerStoreApi, 'getDraft'>;
  store: Pick<AppStoreApi, 'subscribeActions' | 'subscribeMessageArrivals' | 'getState'>;
};

export function useReplySuggestion({ bufferId, canSuggest, composer, store }: ReplySuggestionOptions) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // Input events can run after invalidation but before React commits the new display.
  const acceptable = useRef<string | null>(null);
  const eligibleNow = useCallback(() => !!bufferId && isWindowActive()
    && selectReplySuggestionBuffer(store.getState()) === bufferId && !composer.getDraft(bufferId),
  [bufferId, composer, store]);
  const pending = useRef<{ controller: AbortController; timer: number } | null>(null);

  const cancel = useCallback(() => {
    if (!pending.current) return;
    window.clearTimeout(pending.current.timer);
    pending.current.controller.abort();
    pending.current = null;
  }, []);

  const dismiss = useCallback(() => {
    acceptable.current = null;
    cancel();
    setSuggestion(null);
  }, [cancel]);

  const take = useCallback((displayed: string) => {
    const valid = acceptable.current === displayed && eligibleNow();
    dismiss();
    return valid;
  }, [dismiss, eligibleNow]);

  useLayoutEffect(() => {
    dismiss();
    if (!bufferId || !canSuggest) return;

    let sourceMessage: ChatMessage | null = null;
    const unsubscribeArrivals = store.subscribeMessageArrivals(({ buffer, message }) => {
      if (buffer.id !== bufferId || buffer.kind !== 'query' || !isIncomingReplySuggestionText(message)
        || isMessageMuted(store.getState().domain.mutedNicks, message) || message.id === sourceMessage?.id || !eligibleNow()) return;

      sourceMessage = message;
      dismiss();
      const controller = new AbortController();
      const timer = window.setTimeout(async () => {
        try {
          if (!eligibleNow()) return;
          const result = await aiAssistantApi.suggestReply(bufferId, message.id, controller.signal);
          if (!controller.signal.aborted && eligibleNow()) {
            acceptable.current = result.suggestion;
            setSuggestion(result.suggestion);
          }
        } catch {
          // Predictions are optional. Leave the message box ready for typing.
        } finally {
          if (pending.current?.controller === controller) pending.current = null;
        }
      }, 500);
      pending.current = { controller, timer };
    });
    const unsubscribeActions = store.subscribeActions(({ action, previousState, state }) => {
      if (!sourceMessage || (!pending.current && acceptable.current === null)) return;
      const networkId = sourceMessage.networkId;
      const messagesChanged = previousState.domain.messages[bufferId] !== state.domain.messages[bufferId];
      const muteAdded = action.type === 'upsert-muted-nick' && action.mutedNick.networkId === networkId;
      const muteRemoved = action.type === 'remove-muted-nick' && previousState.domain.mutedNicks.some(
        mute => mute.id === action.mutedNickId && mute.networkId === networkId,
      );
      if (messagesChanged || muteAdded || muteRemoved || action.type === 'snapshot'
        || selectReplySuggestionBuffer(state) !== bufferId) {
        dismiss();
        return;
      }
      if (action.type === 'remove-messages' && action.messageIds.length) {
        const sameConversation = action.bufferId
          ? action.bufferId === bufferId
          : action.networkId === sourceMessage.networkId && isSameIrcIdentifier(
              action.target, sourceMessage.target, state.domain.networkStates[action.networkId]?.serverRules?.caseMapping,
            );
        if (sameConversation || action.messageIds.includes(sourceMessage.id)) dismiss();
      }
    });
    window.addEventListener('blur', dismiss);
    document.addEventListener('visibilitychange', dismiss);
    return () => {
      unsubscribeActions();
      unsubscribeArrivals();
      window.removeEventListener('blur', dismiss);
      document.removeEventListener('visibilitychange', dismiss);
      acceptable.current = null;
      cancel();
    };
  }, [bufferId, canSuggest, store, dismiss, cancel, eligibleNow]);

  return { suggestion: canSuggest ? suggestion : null, dismiss, take };
}
