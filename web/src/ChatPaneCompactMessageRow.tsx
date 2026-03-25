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
  senderLabel?: string | null;
  showKindBadge?: boolean;
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
  const showMessageNick = message.nick && (message.kind === 'line' || message.kind === 'action' || showKindLabel(message));
  const senderLabel = props.senderLabel ?? (showMessageNick ? message.nick : null);
  const showKindBadge = props.showKindBadge ?? showKindLabel(message);
  const bodyClassName = cn(isAction && 'italic');
  const timeLabel = (
    <span className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-muted-foreground">
      {formatMessageTimestamp(message.ts)}
    </span>
  );
  const metadata = (
    <>
      {senderLabel ? (
        <span className={cn('mr-2 font-sans font-semibold', participantNickTone(message, props.highlightParticipantNicks))}>
          {senderLabel}
        </span>
      ) : null}
      {showKindBadge ? <span className="mr-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{message.kind}</span> : null}
    </>
  );

  return (
    <article className={cn('px-1 py-0.5 text-foreground', messageTone(message))}>
      <div className="grid items-baseline grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1 font-sans">
        {timeLabel}
        <div className="min-w-0">
          <p className="min-w-0 break-words font-sans text-[13px] leading-5 text-inherit">
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
          </p>
          <FormattedMessageInlinePreviews hrefs={parsedContent.inlineImageHrefs} />
        </div>
      </div>
    </article>
  );
}
