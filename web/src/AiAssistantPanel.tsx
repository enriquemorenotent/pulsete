import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { BufferState } from '../../shared/protocol-chat.js';
import {
  aiAssistantThreadMaxTurns,
  type AiAssistantMode,
  type AiAssistantProviderStatus,
  type AiAssistantSelection,
} from '../../shared/protocol-ai.js';
import { Button } from '@/components/ui/button.js';
import { aiAssistantApi } from './ai-assistant-client.js';
import {
  createAiAssistantStore,
  hasAiAssistantThreadContent,
  type AiAssistantStoreApi,
  useAiAssistantThread,
} from './ai-assistant-store.js';
import { AiAssistantChatView } from './AiAssistantChatView.js';
import type { AssistantEntry } from './AiAssistantChatTypes.js';
import { AiAssistantConnectionPanel } from './AiAssistantConnectionPanel.js';
import { AiAssistantModelControls } from './AiAssistantModelControls.js';
import { resolveAiAssistantSelection } from './ai-assistant-model-selection.js';
import {
  InspectorPanel,
  InspectorSection,
} from './RightSidebarInspector.js';

type AiAssistantPanelProps = {
  buffer: BufferState | null;
  onSelectionChange?: (selection: AiAssistantSelection) => boolean | Promise<boolean>;
  onUseSuggestion: (value: string) => void;
  selection?: AiAssistantSelection;
  store?: AiAssistantStoreApi;
};

const defaultSelection: AiAssistantSelection = {
  model: null,
  reasoningEffort: null,
};

export function AiAssistantPanel(props: AiAssistantPanelProps) {
  const [localStore] = useState(createAiAssistantStore);
  const store = props.store ?? localStore;
  const bufferId = props.buffer?.id ?? null;
  const thread = useAiAssistantThread(store, bufferId);
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);
  const [optimisticSelection, setOptimisticSelection] = useState<AiAssistantSelection | null>(null);
  const savedSelection = optimisticSelection ?? props.selection ?? defaultSelection;
  const resolvedSelection = resolveAiAssistantSelection(status, savedSelection);

  const changeSelection = (selection: AiAssistantSelection) => {
    setOptimisticSelection(selection);
    void Promise.resolve(props.onSelectionChange?.(selection) ?? true).finally(() => {
      setOptimisticSelection((current) => selectionsMatch(current, selection) ? null : current);
    });
  };

  const ask = async (
    mode: AiAssistantMode,
    prompt: string,
    label = prompt,
    nextPendingLabel = 'Thinking',
  ) => {
    if (!bufferId || (mode === 'answer' && !prompt.trim())) {
      return;
    }
    const assistantTurns = buildAssistantTurns(store.getThread(bufferId).entries);
    const currentRequestId = store.startRequest(bufferId, {
      label: label || 'Draft a reply',
      pendingLabel: nextPendingLabel,
    });
    if (currentRequestId === null) {
      return;
    }
    try {
      const response = await aiAssistantApi.ask(bufferId, {
        assistantTurns,
        mode,
        prompt,
        selection: resolvedSelection.selection,
      });
      setStatus(response.status);
      store.resolveRequest(bufferId, currentRequestId, {
        mode,
        text: response.answer,
      });
    } catch (reason) {
      store.failRequest(
        bufferId,
        currentRequestId,
        reason instanceof Error ? reason.message : 'Assistant request failed',
      );
    }
  };

  const submit = () => {
    if (!bufferId) {
      return;
    }
    const current = store.getThread(bufferId);
    const prompt = current.input.trim();
    if (!prompt || current.pending) {
      return;
    }
    store.setInput(bufferId, '');
    void ask('answer', prompt);
  };

  const connected = status?.connected === true;
  const hasThreadContent = hasAiAssistantThreadContent(thread);
  return (
    <InspectorPanel className="gap-3 py-3.5">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.045] pb-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-sm font-semibold tracking-tight text-foreground/92">
            Assistant
          </h2>
          {props.buffer ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground/82">
              {props.buffer.target}
            </p>
          ) : null}
        </div>
        {hasThreadContent ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 text-foreground/72 hover:text-foreground"
            disabled={!bufferId}
            onClick={() => {
              if (bufferId) {
                store.clearThread(bufferId);
              }
            }}
          >
            <MessageSquarePlus />
            New chat
          </Button>
        ) : null}
      </header>
      <InspectorSection className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AiAssistantConnectionPanel compact onStatusChange={setStatus} />
        {connected ? (
          <>
            <AiAssistantModelControls
              disabled={thread.pending}
              onSelectionChange={changeSelection}
              savedSelection={savedSelection}
              status={status}
            />
            <AiAssistantChatView
              entries={thread.entries}
              error={thread.error}
              input={thread.input}
              pending={thread.pending}
              pendingLabel={thread.pendingLabel}
              onAsk={ask}
              onChange={(value) => {
                if (bufferId) {
                  store.setInput(bufferId, value);
                }
              }}
              onSubmit={submit}
              onUseSuggestion={props.onUseSuggestion}
            />
          </>
        ) : null}
      </InspectorSection>
    </InspectorPanel>
  );
}

const buildAssistantTurns = (entries: readonly AssistantEntry[]) =>
  entries
    .slice(-aiAssistantThreadMaxTurns)
    .map((entry) => ({ role: entry.role, text: entry.text.trim() }))
    .filter((entry) => entry.text);

const selectionsMatch = (
  left: AiAssistantSelection | null,
  right: AiAssistantSelection,
) => left?.model === right.model && left.reasoningEffort === right.reasoningEffort;
