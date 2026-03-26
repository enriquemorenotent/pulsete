import { useMemo } from 'react';
import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';
import { ParticipantNickLabel } from './ParticipantNickLabel.js';
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
} from './chat-pane-message-utils.js';

type ChatPaneCompactMessageRowProps = {
  message: ChatMessage;
  participant: MessageParticipantPresentation;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
};

export function ChatPaneCompactMessageRow(props: ChatPaneCompactMessageRowProps) {
  const { message } = props;
  const isAction = isActionMessage(message);
  const parsedContent = useMemo(
    () => parseFormattedMessageContent(message.body, props.mode),
    [message.body, props.mode]
  );
  const hasVisibleText = hasVisibleFormattedMessageText(parsedContent);
  const bodyClassName = cn(isAction && 'italic');
  const timeLabel = (
    <span className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-muted-foreground">
      {formatMessageTimestamp(message.ts)}
    </span>
  );
  const metadata = (
    <>
      {props.participant.label ? (
        <ParticipantNickLabel
          nick={props.participant.label}
          clickable={props.participant.clickable}
          onOpenParticipantQuery={props.onOpenParticipantQuery}
          className={cn('mr-2 font-sans font-semibold', props.participant.toneClassName)}
        />
      ) : null}
      {props.participant.kindBadgeLabel ? (
        <span className="mr-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {props.participant.kindBadgeLabel}
        </span>
      ) : null}
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
