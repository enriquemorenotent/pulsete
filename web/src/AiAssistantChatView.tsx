import {
  FileText,
  History,
  LoaderCircle,
  PenLine,
  Search,
  Send,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AiAssistantMode } from '../../shared/protocol-ai.js';
import { Button } from '@/components/ui/button.js';
import { AiAssistantConversation } from './AiAssistantConversation.js';
import type { AssistantAskHandler, AssistantEntry } from './AiAssistantChatTypes.js';

type QuickAction = {
  icon: LucideIcon;
  label: string;
  mode: AiAssistantMode;
  pendingLabel: string;
  prompt: string;
};

const quickActions = [
  {
    icon: FileText,
    label: 'Summarize',
    mode: 'answer',
    pendingLabel: 'Summarizing',
    prompt: 'Summarize this conversation.',
  },
  {
    icon: History,
    label: 'Catch me up',
    mode: 'answer',
    pendingLabel: 'Catching up',
    prompt: 'Catch me up on the recent conversation.',
  },
  {
    icon: Search,
    label: 'Find something',
    mode: 'answer',
    pendingLabel: 'Searching',
    prompt: 'List the important details in this conversation.',
  },
  {
    icon: PenLine,
    label: 'Draft reply',
    mode: 'suggest-reply',
    pendingLabel: 'Drafting',
    prompt: '',
  },
] satisfies QuickAction[];

type AiAssistantChatViewProps = {
  entries: readonly AssistantEntry[];
  error: string;
  input: string;
  onAsk: AssistantAskHandler;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUseSuggestion: (value: string) => void;
  pending: boolean;
  pendingLabel: string;
};

export function AiAssistantChatView(props: AiAssistantChatViewProps) {
  return (
    <>
      <QuickActions pending={props.pending} onAsk={props.onAsk} />
      <AiAssistantConversation
        entries={props.entries}
        pending={props.pending}
        pendingLabel={props.pendingLabel}
        onUseSuggestion={props.onUseSuggestion}
      />
      {props.error ? (
        <p role="alert" className="rounded-sm border border-amber-300/18 bg-amber-300/8 px-2.5 py-2 text-[12px] text-amber-100">
          {props.error}
        </p>
      ) : null}
      <AssistantInput
        disabled={props.pending}
        value={props.input}
        onChange={props.onChange}
        onSubmit={props.onSubmit}
      />
    </>
  );
}

function QuickActions(props: {
  pending: boolean;
  onAsk: AssistantAskHandler;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {quickActions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="h-auto min-h-9 justify-start whitespace-normal px-2.5 py-2 text-left leading-4"
            disabled={props.pending}
            onClick={() => props.onAsk(
              action.mode,
              action.prompt,
              action.label,
              action.pendingLabel,
            )}
          >
            <Icon />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}

function AssistantInput(props: {
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  return (
    <div className="flex shrink-0 items-end gap-2">
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            props.onSubmit();
          }
        }}
        placeholder={props.disabled ? 'Assistant is working...' : 'Ask about this conversation...'}
        disabled={props.disabled}
        aria-busy={props.disabled}
        className="min-h-16 flex-1 resize-none rounded-sm border border-white/[0.055] bg-white/[0.018] px-2.5 py-2 text-[13px] leading-5 text-foreground/84 outline-none placeholder:text-muted-foreground/54 focus-visible:border-ring/60 disabled:opacity-70"
      />
      <Button
        size="icon"
        aria-label={props.disabled ? 'Assistant working' : 'Ask assistant'}
        disabled={props.disabled || !props.value.trim()}
        onClick={props.onSubmit}
      >
        {props.disabled ? <LoaderCircle className="animate-spin" /> : <Send />}
      </Button>
    </div>
  );
}
