import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { MessageAvatar } from './MessageAvatar.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import { formatMessageTime, messageTone } from './chat-pane-message-utils.js';

type ChatPaneMessageGroupProps = {
  messages: ChatMessage[];
  mode: MessageDisplayMode;
  sourceLabel: string;
  onOpenChannel: (channel: string) => void;
};

export function ChatPaneMessageGroup(props: ChatPaneMessageGroupProps) {
  const firstMessage = props.messages[0];
  const continuationMessages = props.messages.slice(1);

  return (
    <article className={cn('border px-2 py-1.5', messageTone(firstMessage))}>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-1">
        <div className="pt-0.5">{firstMessage.nick ? <MessageAvatar nick={firstMessage.nick} /> : null}</div>
        <div className="min-w-0">
          <div className="mb-0.5 flex flex-wrap items-baseline gap-2">
            <span className="font-sans text-[15px] font-semibold text-foreground">{props.sourceLabel}</span>
            <span className="text-[11px] leading-5 text-muted-foreground">
              {formatMessageTime(firstMessage.ts)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground">
            <FormattedMessageText text={firstMessage.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </p>
        </div>

        {continuationMessages.map((message) => (
          <div key={message.id} className="group/line col-span-2 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3">
            <span className="pr-1 pt-0.5 text-right text-[11px] leading-5 text-muted-foreground/85 opacity-0 transition-opacity group-hover/line:opacity-100">
              {formatMessageTime(message.ts)}
            </span>
            <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-foreground">
              <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
