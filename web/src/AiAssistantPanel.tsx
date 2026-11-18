import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Maximize2, Minimize2 } from 'lucide-react';
import type { BufferState } from '../../shared/protocol-chat.js';
import {
  type AiAssistantMode,
  type AiAssistantProviderStatus,
  type AiAssistantSelection,
} from '../../shared/protocol-ai.js';
import { normalizeAssistantTurns } from '../../shared/ai-assistant-turns.js';
import { stripAssistantSourceLabels } from '../../shared/ai-assistant-sources.js';
import { Button } from '@/components/ui/button.js';
import { aiAssistantApi } from './ai-assistant-client.js';
import {
  createAiAssistantStore,
  hasAiAssistantThreadContent,
  type AiAssistantStoreApi,
  useAiAssistantThread,
} from './ai-assistant-store.js';
import { useAssistantReadingMode } from './assistant-reading-mode.js';
import { AiAssistantChatView } from './AiAssistantChatView.js';
import type { AssistantEntry } from './AiAssistantChatTypes.js';
import { AiAssistantConnectionPanel } from './AiAssistantConnectionPanel.js';
import { AiAssistantSettings } from './AiAssistantSettings.js';
import { resolveAiAssistantSelection } from './ai-assistant-model-selection.js';
import {
  InspectorPanel,
  InspectorSection,
} from './RightSidebarInspector.js';

type AiAssistantPanelProps = {
  buffer: BufferState | null;
  recentOnly?: boolean;
  onRecentOnlyChange?: (recentOnly: boolean) => Promise<boolean>;
  onSelectionChange?: (selection: AiAssistantSelection) => boolean | Promise<boolean>;
  onUseSuggestion: (value: string) => void;
  onOpenSource?: (bufferId: string, messageId: string) => Promise<boolean>;
  selection?: AiAssistantSelection;
  store?: AiAssistantStoreApi;
};

const defaultSelection: AiAssistantSelection = {
  model: null,
  reasoningEffort: null,
};

export function AiAssistantPanel(props: AiAssistantPanelProps) {
  const reading = useAssistantReadingMode();
  const [localStore] = useState(createAiAssistantStore);
  const store = props.store ?? localStore;
  const bufferId = props.buffer?.id ?? null;
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => () => { for (const controller of controllers.current.values()) controller.abort(); }, []);
  useEffect(() => store.subscribe(() => {
    for (const [id, controller] of controllers.current) if (!store.getThread(id).pending) controller.abort();
  }), [store]);
  const cancel = () => { if (bufferId) controllers.current.get(bufferId)?.abort(); };
  const thread = useAiAssistantThread(store, bufferId);
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);
  const [optimisticSelection, setOptimisticSelection] = useState<AiAssistantSelection | null>(null);
  const [recentOnlyOverride, setRecentOnlyOverride] = useState<boolean | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const recentOnly = recentOnlyOverride ?? props.recentOnly ?? false;
  const savedSelection = optimisticSelection ?? props.selection ?? defaultSelection;
  const resolvedSelection = resolveAiAssistantSelection(status, savedSelection);

  const changeSelection = (selection: AiAssistantSelection) => {
    setOptimisticSelection(selection);
    void Promise.resolve(props.onSelectionChange?.(selection) ?? true).finally(() => {
      setOptimisticSelection((current) => selectionsMatch(current, selection) ? null : current);
    });
  };

  const changeRecentOnly = async (value: boolean) => {
    setRecentOnlyOverride(value);
    if (!props.onRecentOnlyChange) return;
    setSavingAccess(true);
    try { await props.onRecentOnlyChange(value); }
    finally {
      setRecentOnlyOverride(null);
      setSavingAccess(false);
    }
  };

  const ask = async (
    mode: AiAssistantMode,
    prompt: string,
    label = prompt,
    nextPendingLabel = 'Thinking',
  ) => {
    if (!bufferId || savingAccess || (mode === 'answer' && !prompt.trim())) {
      return;
    }
    const currentThread = store.getThread(bufferId);
    const assistantTurns = buildAssistantTurns(currentThread.entries);
    const currentRequestId = store.startRequest(bufferId, {
      label: label || 'Draft a reply',
      pendingLabel: nextPendingLabel,
    });
    if (currentRequestId === null) {
      return;
    }
    const controller = new AbortController();
    controllers.current.set(bufferId, controller);
    try {
      const response = await aiAssistantApi.ask(bufferId, {
        assistantTurns,
        continuationToken: currentThread.continuationToken,
        mode,
        scope: recentOnly ? 'recent' : 'auto',
        webLookup: mode === 'answer' && currentThread.webLookup,
        prompt,
        selection: resolvedSelection.selection,
      }, controller.signal, (stage) => store.updateProgress(bufferId, currentRequestId, progressLabels[stage]));
      controller.signal.throwIfAborted();
      if (store.getThread(bufferId).activeRequestId !== currentRequestId) return;
      setStatus(response.status);
      store.resolveRequest(bufferId, currentRequestId, {
        mode: response.mode,
        text: response.answer,
        context: response.context,
        continuationToken: response.continuationToken,
      });
    } catch (reason) {
      store.failRequest(
        bufferId,
        currentRequestId,
        controller.signal.aborted ? ''
          : reason instanceof Error ? reason.message : 'Assistant request failed',
        label === prompt ? prompt : '',
      );
    } finally {
      if (controllers.current.get(bufferId) === controller) controllers.current.delete(bufferId);
    }
  };

  const submit = () => {
    if (!bufferId) {
      return;
    }
    const current = store.getThread(bufferId);
    const prompt = current.input.trim();
    if (!prompt || current.pending || savingAccess) {
      return;
    }
    store.setInput(bufferId, '');
    void ask('answer', prompt);
  };

  const connected = status?.connected === true;
  const hasThreadContent = hasAiAssistantThreadContent(thread);
  return (
    <InspectorPanel className="gap-0 px-3 py-0">
      <header className="-mx-3 flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <h2 className="min-w-0 truncate text-[14px] font-semibold text-foreground">
          {props.buffer?.target ?? 'Assistant'}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {connected ? <AiAssistantSettings status={status} selection={savedSelection} recentOnly={recentOnly}
            webLookup={thread.webLookup} disabled={thread.pending || savingAccess} onRecentOnlyChange={changeRecentOnly}
            onWebLookupChange={(enabled) => { if (bufferId) store.setWebLookup(bufferId, enabled); }}
            onSelectionChange={changeSelection} /> : null}
          {connected || hasThreadContent ? (
            <Button type="button" size="icon" variant="ghost" aria-label="New assistant chat" title="New chat"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              disabled={!bufferId || !hasThreadContent}
              onClick={() => {
                if (!bufferId) return;
                controllers.current.get(bufferId)?.abort();
                const token = store.getThread(bufferId).continuationToken;
                if (token) void aiAssistantApi.clear(bufferId, token).catch(() => undefined);
                store.clearThread(bufferId);
              }}>
              <MessageSquarePlus />
            </Button>
          ) : null}
          {reading ? <Button type="button" size="icon" variant="ghost"
            className="size-8 text-muted-foreground" aria-label={reading.expanded ? 'Reduce assistant width' : 'Expand assistant'}
            title={reading.expanded ? 'Reduce width' : 'Expand for reading'}
            onClick={() => reading.setExpanded(!reading.expanded)}>
            {reading.expanded ? <Minimize2 /> : <Maximize2 />}
          </Button> : null}
        </div>
      </header>
      <InspectorSection className="flex min-h-0 flex-1 flex-col space-y-0 overflow-hidden pt-2.5 pb-3">
        <AiAssistantConnectionPanel compact onStatusChange={setStatus} />
        {connected ? (
          <AiAssistantChatView
            disabled={savingAccess}
            entries={thread.entries}
            error={thread.error}
            input={thread.input}
            pending={thread.pending}
            pendingLabel={thread.pendingLabel}
            onAsk={ask}
            onCancel={cancel}
            onChange={value => { if (bufferId) store.setInput(bufferId, value); }}
            onSubmit={submit}
            onUseSuggestion={props.onUseSuggestion}
            onOpenSource={props.onOpenSource}
          />
        ) : null}
      </InspectorSection>
    </InspectorPanel>
  );
}

const buildAssistantTurns = (entries: readonly AssistantEntry[]) =>
  normalizeAssistantTurns(entries.map(({ role, text, context }) => ({ role, text: role === 'assistant' && context
    ? stripAssistantSourceLabels(text, new Set([...(context.sources ?? []), ...(context.webSources ?? [])].map(({ label }) => label)))
    : text })));

const selectionsMatch = (
  left: AiAssistantSelection | null,
  right: AiAssistantSelection,
) => left?.model === right.model && left.reasoningEffort === right.reasoningEffort;

const progressLabels = {
  preparing: 'Thinking', searching: 'Looking back in the chat', reading: 'Looking back in the chat',
  'searching-web': 'Looking up public information', writing: 'Thinking', checking: 'Thinking',
};
