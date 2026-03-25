import { useMemo } from 'react';
import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import {
  FormattedMessageInlinePreviews,
  FormattedMessageText,
  hasVisibleFormattedMessageText,
  parseFormattedMessageContent,
} from './FormattedMessageText.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  formatMessageTimestamp,
  isActionMessage,
  messageTone,
  participantNickTone,
  showKindLabel,
} from './chat-pane-message-utils.js';

type ChatPaneCompactMessageRowProps = {
  message: ChatMessage;
  highlightParticipantNicks: boolean;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
};

export function ChatPaneCompactMessageRow(props: ChatPaneCompactMessageRowProps) {
  const { message } = props;
  const isAction = isActionMessage(message);
  const parsedContent = useMemo(
    () => parseFormattedMessageContent(message.body, props.mode),
    [message.body, props.mode]
  );
  const hasVisibleText = hasVisibleFormattedMessageText(parsedContent);
  const showNick = message.nick && (message.kind === 'line' || message.kind === 'action' || showKindLabel(message));
  const bodyClassName = cn('min-w-0 break-words font-sans text-[13px] leading-5 text-inherit', isAction && 'italic');
  const timeLabel = (
    <span className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-muted-foreground">
      {formatMessageTimestamp(message.ts)}
    </span>
  );
  const metadata = (
    <>
      {showNick ? (
        <span className={cn('font-sans font-semibold', participantNickTone(message, props.highlightParticipantNicks))}>
          {message.nick}
        </span>
      ) : null}
      {showKindLabel(message) ? <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{message.kind}</span> : null}
    </>
  );

  return (
    <article className={cn('px-1 py-0.5 text-foreground', messageTone(message))}>
      <div className="grid items-baseline grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1 font-sans">
        {timeLabel}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
            {metadata}
            {hasVisibleText ? (
              <span className={bodyClassName}>
                <FormattedMessageText
                  text={message.body}
                  mode={props.mode}
                  onOpenChannel={props.onOpenChannel}
                  parsedContent={parsedContent}
                  renderInlinePreviews={false}
                />
              </span>
            ) : null}
          </div>
          <FormattedMessageInlinePreviews hrefs={parsedContent.inlineImageHrefs} />
        </div>
      </div>
    </article>
  );
}
