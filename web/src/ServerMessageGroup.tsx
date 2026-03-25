import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { formatMessageTimestamp, messageTone } from './chat-pane-message-utils.js';

type ServerMessageGroupProps = {
  messages: ChatMessage[];
  mode: MessageDisplayMode;
  sourceLabel: string;
  onOpenChannel: (channel: string) => void;
};

export function ServerMessageGroup(props: ServerMessageGroupProps) {
  const firstMessage = props.messages[0];
  const continuationMessages = props.messages.slice(1);

  return (
    <article className={cn('px-1 py-0.5 text-foreground', messageTone(firstMessage))}>
      <div className="space-y-1">
        <div className="min-w-0">
          <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-[15px] font-semibold text-inherit">{props.sourceLabel}</span>
            <span className="tabular-nums text-[11px] leading-5 text-muted-foreground">
              {formatMessageTimestamp(firstMessage.ts)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-inherit">
            <FormattedMessageText text={firstMessage.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </p>
        </div>

        {continuationMessages.map((message) => (
          <div key={message.id} className="group/line grid grid-cols-[11rem_minmax(0,1fr)] gap-x-3">
            <span className="pr-1 pt-0.5 text-right tabular-nums text-[11px] leading-5 text-muted-foreground/85 opacity-0 transition-opacity group-hover/line:opacity-100">
              {formatMessageTimestamp(message.ts)}
            </span>
            <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-inherit">
              <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
