import { useMemo } from 'react';
import type { ChatMessage } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import { cn } from '@/lib/utils.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';
import { ParticipantNickLabel } from './ParticipantNickLabel.js';
import {
  FormattedMessageInlinePreviews,
  FormattedMessageText,
  hasVisibleFormattedMessageText,
  type InlineImageRenderingMode,
  parseFormattedMessageContent,
} from './FormattedMessageText.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  formatMessageTime,
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  getLifecycleEventLabel,
  getLifecycleEventSummary,
  getLifecycleEventTone,
  isActionMessage,
  messageDeliveryTone,
  messageTone,
} from './chat-pane-message-utils.js';

type ChatPaneCompactMessageRowProps = {
  message: ChatMessage;
  participant: MessageParticipantPresentation;
  hideTimestamp?: boolean;
  inlineImageRendering?: InlineImageRenderingMode;
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
};

export function ChatPaneCompactMessageRow(props: ChatPaneCompactMessageRowProps) {
  const { message } = props;
  const isAction = isActionMessage(message);
  const lifecycleEventSummary = getLifecycleEventSummary(message);
  const displayText = lifecycleEventSummary ?? message.body;
  const parsedContent = useMemo(
    () => parseFormattedMessageContent(displayText, props.mode),
    [displayText, props.mode]
  );
  const inlineImageRendering = props.inlineImageRendering ?? 'preview';
  const hasVisibleText = hasVisibleFormattedMessageText(parsedContent, {
    inlineImageRendering,
  });
  const lifecycleEventLabel = getLifecycleEventLabel(message);
  const bodyClassName = cn(isAction && 'italic');
  const timeLabel = (
    props.hideTimestamp
      ? (
        <span
          aria-hidden
          className="invisible shrink-0 font-sans tabular-nums text-[11px] leading-5 text-[var(--transcript-meta)]"
        >
          00:00
        </span>
      )
      : (
        <time
          className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-[var(--transcript-meta)]"
          dateTime={formatMessageTimestampDateTime(message.ts)}
          title={formatMessageTimestampTitle(message.ts)}
        >
          {formatMessageTime(message.ts)}
        </time>
      )
  );
  const metadata = (
    <>
      {props.participant.label ? (
        <ParticipantNickLabel
          nick={props.participant.label}
          identity={message.senderIdentity}
          emoji={props.participant.emoji}
          clickable={props.participant.clickable}
          onOpenParticipantQuery={props.onOpenParticipantQuery}
          className={cn('mr-2 font-sans font-medium', props.participant.toneClassName)}
        />
      ) : null}
      {props.participant.kindBadgeLabel ? (
        <span className="mr-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground/65">
          {props.participant.kindBadgeLabel}
        </span>
      ) : null}
      {lifecycleEventLabel ? (
        <span
          className={cn(
            'mr-2 inline-flex h-4 min-w-10 items-center justify-center rounded-sm border px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]',
            getLifecycleEventTone(message),
          )}
        >
          {lifecycleEventLabel}
        </span>
      ) : null}
    </>
  );

  return (
    <article
      className={cn('px-1 py-0.5', messageTone(message), messageDeliveryTone(message))}
      data-message-delivery={message.delivery === 'server-history' ? message.delivery : undefined}
      data-message-id={message.id}
    >
      <div className="grid items-baseline grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1 font-sans">
        {timeLabel}
        <div className="min-w-0">
          <p className="min-w-0 break-words font-sans text-[15px] leading-6 text-inherit">
            {metadata}
            {hasVisibleText ? (
              <span className={bodyClassName}>
                <FormattedMessageText
                  text={displayText}
                  inlineImageRendering={inlineImageRendering === 'link' ? 'link' : 'hidden'}
                  mode={props.mode}
                  onInlinePreviewLoad={props.onInlinePreviewLoad}
                  onOpenChannel={props.onOpenChannel}
                  parsedContent={parsedContent}
                  renderInlinePreviews={false}
                />
              </span>
            ) : null}
          </p>
          {inlineImageRendering === 'preview' ? (
            <FormattedMessageInlinePreviews
              media={parsedContent.inlineMedia}
              onInlinePreviewLoad={props.onInlinePreviewLoad}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
