import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText, hasInlineImagePreview } from './FormattedMessageText.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  formatMessageTime,
  isActionMessage,
  messageTone,
  showKindLabel,
} from './chat-pane-message-utils.js';

type ChatPaneCompactMessageRowProps = {
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
};

export function ChatPaneCompactMessageRow(props: ChatPaneCompactMessageRowProps) {
  const { message } = props;
  const isAction = isActionMessage(message);
  const hasInlinePreview = hasInlineImagePreview(message.body, props.mode);
  const showNick = message.nick && (message.kind === 'line' || message.kind === 'action' || showKindLabel(message));
  const bodyClassName = cn('min-w-0 break-words font-sans text-[13px] leading-5 text-inherit', isAction && 'italic');
  const timeLabel = (
    <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      {formatMessageTime(message.ts)}
    </span>
  );
  const metadata = (
    <>
      {showNick ? (
        <span className="font-semibold text-inherit">{message.nick}</span>
      ) : null}
      {showKindLabel(message) ? <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{message.kind}</span> : null}
    </>
  );

  return (
    <article className={cn('px-1 py-0.5 text-foreground', messageTone(message))}>
      {hasInlinePreview ? (
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
          <span className="pr-1 pt-0.5 text-right text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {formatMessageTime(message.ts)}
          </span>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
            {metadata}
          </div>
          <div className={cn('col-start-2', bodyClassName)}>
            <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </div>
        </div>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
          {timeLabel}
          {metadata}
          <span className={bodyClassName}>
            <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </span>
        </p>
      )}
    </article>
  );
}
