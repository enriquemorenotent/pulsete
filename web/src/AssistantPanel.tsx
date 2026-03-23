import { useEffect, useMemo, useState } from 'react';
import type { AssistantItem, AssistantSnapshot, AssistantThread } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';

export type AssistantPanelProps = {
  assistant: AssistantSnapshot;
  contextKey: string;
  contextEmpty: boolean;
  loading: boolean;
  busy: boolean;
  thread: AssistantThread | null;
  onSubmitPrompt: (prompt: string) => Promise<boolean>;
  onInterruptTurn: (turnId: string) => Promise<unknown>;
};

export function AssistantPanel(props: AssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const activeTurn = useMemo(() => findActiveTurn(props.thread), [props.thread]);
  const conversation = useMemo(() => buildConversation(props.thread), [props.thread]);
  const assistantReady = props.assistant.serviceStatus === 'ready' && !!props.assistant.auth.account;

  useEffect(() => {
    setPrompt('');
  }, [props.contextKey]);

  const sendDisabled = !assistantReady || props.busy || !prompt.trim();
  const showStatus = props.contextEmpty
    || !assistantReady
    || !!props.assistant.auth.lastError
    || (props.assistant.serviceStatus === 'error' && !!props.assistant.serviceError);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-card">
      {showStatus ? (
        <div className="space-y-2 border-b border-border bg-secondary/20 px-3 py-3 text-[13px]">
          {props.assistant.auth.lastError ? (
            <p className="text-destructive">{props.assistant.auth.lastError}</p>
          ) : null}
          {props.assistant.serviceStatus === 'error' && props.assistant.serviceError ? (
            <p className="text-destructive">{props.assistant.serviceError}</p>
          ) : null}
          {props.contextEmpty ? (
            <p className="text-muted-foreground">No history is available for this buffer yet.</p>
          ) : null}
          {!assistantReady ? (
            <p className="text-muted-foreground">Open Preferences to sign in and enable the assistant.</p>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 bg-background">
        <div className="space-y-3 px-3 py-3">
          {props.loading ? (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
              Loading conversation…
            </div>
          ) : null}
          {!props.loading && conversation.length === 0 ? (
            <div className="rounded-md border border-border bg-card px-3 py-3 text-[13px] text-muted-foreground">
              Ask a question.
            </div>
          ) : null}
          {conversation.map((entry) => (
            <div
              key={entry.id}
              className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  entry.role === 'user'
                    ? 'max-w-[90%] rounded-md bg-accent px-3 py-2 text-[13px] text-foreground'
                    : entry.role === 'assistant'
                      ? 'max-w-[90%] rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground'
                      : 'max-w-[90%] rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive'
                }
              >
                <p className="whitespace-pre-wrap">{entry.text}</p>
              </div>
            </div>
          ))}
          {props.busy ? (
            <div className="flex justify-start">
              <div className="rounded-md border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                Thinking…
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t border-border bg-card px-3 py-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={assistantReady ? 'Ask a question' : 'Open Preferences to sign in first.'}
          disabled={!assistantReady || props.busy}
          className="min-h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          {activeTurn ? (
            <Button variant="ghost" size="sm" onClick={() => void props.onInterruptTurn(activeTurn.id)}>
              Interrupt
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={sendDisabled} onClick={async () => {
            if (await props.onSubmitPrompt(prompt)) {
              setPrompt('');
            }
          }}>
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}

const findActiveTurn = (thread: AssistantThread | null) => thread?.turns.find((turn) => turn.status === 'inProgress') ?? null;

type ConversationEntry = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
};

const buildConversation = (thread: AssistantThread | null): ConversationEntry[] => {
  if (!thread) {
    return [];
  }
  return thread.turns.flatMap((turn) => {
    const items = turn.items.flatMap((item) => mapItemToConversationEntry(item));
    if (turn.status === 'failed' && turn.error) {
      return [...items, { id: `${turn.id}-error`, role: 'error' as const, text: turn.error }];
    }
    return items;
  });
};

const mapItemToConversationEntry = (item: AssistantItem): ConversationEntry[] => {
  if (item.type === 'userMessage') {
    return [{ id: item.id, role: 'user', text: item.text }];
  }
  if (item.type === 'agentMessage' && item.text.trim()) {
    return [{ id: item.id, role: 'assistant', text: item.text }];
  }
  return [];
};
