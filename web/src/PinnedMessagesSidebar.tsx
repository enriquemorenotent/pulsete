import { useState } from 'react';
import { PinOff } from 'lucide-react';
import type { BufferState, ChatMessage } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import {
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  isActionMessage,
} from './chat-pane-message-utils.js';
import { getVisibleIrcText } from './irc-format.js';
import { InspectorPanel } from './RightSidebarInspector.js';

export type PinnedMessagesLoadState = 'idle' | 'loading' | 'loaded' | 'error';

export function PinnedMessagesSidebar(props: {
  buffer: BufferState | null;
  loadState: PinnedMessagesLoadState;
  messages: ChatMessage[];
  onJump: (bufferId: string, messageId: string) => Promise<boolean>;
  onRetry: () => void;
  onUnpin: (bufferId: string, messageId: string) => Promise<boolean>;
}) {
  if (!props.buffer) {
    return null;
  }

  return (
    <InspectorPanel className="gap-0 px-0 py-0">
      <header className="shrink-0 border-b border-white/[0.045] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground/92">
          Pinned messages
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground/72">
          Local to this device · {props.messages.length} {props.messages.length === 1 ? 'pin' : 'pins'}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {props.loadState === 'loading' || props.loadState === 'idle' ? (
          <PinnedMessagesEmptyState>Loading pinned messages...</PinnedMessagesEmptyState>
        ) : props.loadState === 'error' ? (
          <PinnedMessagesEmptyState>
            <span>Could not load pinned messages.</span>
            <Button variant="outline" size="sm" onClick={props.onRetry}>Retry</Button>
          </PinnedMessagesEmptyState>
        ) : props.messages.length === 0 ? (
          <PinnedMessagesEmptyState>
            Hover a text or action message in this PM and select the pin.
          </PinnedMessagesEmptyState>
        ) : (
          <div className="flex flex-col gap-1">
            {props.messages.map((message) => (
              <PinnedMessageCard
                key={message.id}
                message={message}
                onJump={props.onJump}
                onUnpin={props.onUnpin}
              />
            ))}
          </div>
        )}
      </div>
    </InspectorPanel>
  );
}

function PinnedMessageCard(props: {
  message: ChatMessage;
  onJump: (bufferId: string, messageId: string) => Promise<boolean>;
  onUnpin: (bufferId: string, messageId: string) => Promise<boolean>;
}) {
  const [opening, setOpening] = useState(false);
  const [unpinning, setUnpinning] = useState(false);
  const speaker = props.message.speakerNick
    ?? props.message.nick
    ?? (props.message.self ? 'You' : 'Unknown');

  const jumpToMessage = async () => {
    setOpening(true);
    try {
      await props.onJump(props.message.bufferId, props.message.id);
    } finally {
      setOpening(false);
    }
  };
  const unpinMessage = async () => {
    setUnpinning(true);
    try {
      await props.onUnpin(props.message.bufferId, props.message.id);
    } finally {
      setUnpinning(false);
    }
  };

  return (
    <article className="group/pin relative rounded-lg border border-white/[0.055] bg-white/[0.025] transition-colors hover:border-white/[0.09] hover:bg-white/[0.045]">
      <button
        type="button"
        className="block w-full rounded-lg px-3 py-2.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        aria-label={`Open pinned message from ${speaker}`}
        disabled={opening}
        onClick={() => void jumpToMessage()}
      >
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[12px] font-medium text-foreground/88">
            {speaker}
          </span>
          <time
            className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/65"
            dateTime={formatMessageTimestampDateTime(props.message.ts)}
            title={formatMessageTimestampTitle(props.message.ts)}
          >
            {formatPinnedMessageTime(props.message.ts)}
          </time>
        </div>
        <p
          className={cn(
            'line-clamp-4 break-words text-[13px] leading-5 text-foreground/76',
            isActionMessage(props.message) && 'italic',
          )}
        >
          {getVisibleIrcText(props.message.body)}
        </p>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 size-7 opacity-60 hover:opacity-100 focus-visible:opacity-100"
        aria-label="Unpin message"
        title="Unpin message"
        disabled={unpinning}
        onClick={() => void unpinMessage()}
      >
        <PinOff aria-hidden className="size-3.5" />
      </Button>
    </article>
  );
}

function PinnedMessagesEmptyState(props: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-6 text-center text-[12px] leading-5 text-muted-foreground/72">
      {props.children}
    </div>
  );
}

const pinnedMessageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatPinnedMessageTime = (timestamp: number) =>
  pinnedMessageTimeFormatter.format(timestamp);
