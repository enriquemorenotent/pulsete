import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import type { BufferState } from '../../shared/protocol-chat.js';
import {
  aiAssistantThreadMaxTurns,
  type AiAssistantMode,
  type AiAssistantProviderStatus,
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
import {
  InspectorHeader,
  InspectorPanel,
  InspectorSection,
} from './RightSidebarInspector.js';

type AiAssistantPanelProps = {
  buffer: BufferState | null;
  onUseSuggestion: (value: string) => void;
  store?: AiAssistantStoreApi;
};

export function AiAssistantPanel(props: AiAssistantPanelProps) {
  const [localStore] = useState(createAiAssistantStore);
  const store = props.store ?? localStore;
  const bufferId = props.buffer?.id ?? null;
  const thread = useAiAssistantThread(store, bufferId);
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);

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
      const response = await aiAssistantApi.ask(bufferId, { assistantTurns, mode, prompt });
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
  return (
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Private assistant"
        title="Assistant"
        subtitle={props.buffer ? props.buffer.target : undefined}
        actions={(
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!bufferId || !hasAiAssistantThreadContent(thread)}
            onClick={() => {
              if (bufferId) {
                store.clearThread(bufferId);
              }
            }}
          >
            <MessageSquarePlus />
            New chat
          </Button>
        )}
      />
      <InspectorSection className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AiAssistantConnectionPanel compact onStatusChange={setStatus} />
        {connected ? (
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
