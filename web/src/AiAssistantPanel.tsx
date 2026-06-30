import { useEffect, useRef, useState } from 'react';
import type { BufferState } from '../../shared/protocol-chat.js';
import type { AiAssistantMode, AiAssistantProviderStatus } from '../../shared/protocol-ai.js';
import { aiAssistantApi } from './ai-assistant-client.js';
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
};

export function AiAssistantPanel(props: AiAssistantPanelProps) {
  const [entries, setEntries] = useState<AssistantEntry[]>([]);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('Thinking');
  const [status, setStatus] = useState<AiAssistantProviderStatus | null>(null);
  const nextId = useRef(1);
  const requestId = useRef(0);

  useEffect(() => {
    requestId.current += 1;
    setEntries([]);
    setError('');
    setInput('');
    setPending(false);
    setPendingLabel('Thinking');
  }, [props.buffer?.id]);

  const appendEntry = (entry: Omit<AssistantEntry, 'id'>) => {
    setEntries((current) => [...current, { ...entry, id: nextId.current++ }]);
  };

  const ask = async (
    mode: AiAssistantMode,
    prompt: string,
    label = prompt,
    nextPendingLabel = 'Thinking',
  ) => {
    if (!props.buffer || pending || (mode === 'answer' && !prompt.trim())) {
      return;
    }
    const currentRequestId = ++requestId.current;
    const bufferId = props.buffer.id;
    const assistantTurns = buildAssistantTurns(entries);
    setPending(true);
    setPendingLabel(nextPendingLabel);
    setError('');
    appendEntry({ role: 'user', text: label || 'Draft a reply' });
    try {
      const response = await aiAssistantApi.ask(bufferId, { assistantTurns, mode, prompt });
      if (currentRequestId !== requestId.current) {
        return;
      }
      setStatus(response.status);
      appendEntry({ mode, role: 'assistant', text: response.answer });
    } catch (reason) {
      if (currentRequestId !== requestId.current) {
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Assistant request failed');
    } finally {
      if (currentRequestId === requestId.current) {
        setPending(false);
        setPendingLabel('Thinking');
      }
    }
  };

  const submit = () => {
    const prompt = input.trim();
    if (!prompt || pending) {
      return;
    }
    setInput('');
    void ask('answer', prompt);
  };

  const connected = status?.connected === true;
  return (
    <InspectorPanel>
      <InspectorHeader
        eyebrow="Private assistant"
        title="Assistant"
        subtitle={props.buffer ? props.buffer.target : undefined}
      />
      <InspectorSection className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AiAssistantConnectionPanel compact onStatusChange={setStatus} />
        {connected ? (
          <AiAssistantChatView
            entries={entries}
            error={error}
            input={input}
            pending={pending}
            pendingLabel={pendingLabel}
            onAsk={ask}
            onChange={setInput}
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
    .slice(-assistantTurnLimit)
    .map((entry) => ({ role: entry.role, text: entry.text.trim() }))
    .filter((entry) => entry.text);

const assistantTurnLimit = 12;
