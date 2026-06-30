import { cn } from '@/lib/utils.js';
import {
  FormattedMessageText,
  type InlineImageRenderingMode,
} from './FormattedMessageText.js';
import { ParticipantNickLabel } from './ParticipantNickLabel.js';
import {
  formatMessageTime,
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  isActionMessage,
  messageDeliveryTone,
  messageTone,
} from './chat-pane-message-utils.js';
import type { ChatMessage } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';

export const ChatPaneExpandedMessageRow = (props: {
  message: ChatMessage;
  inlineImageRendering?: InlineImageRenderingMode;
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string, identity?: NetworkUserIdentity | null) => void;
  participant: MessageParticipantPresentation;
}) => (
  <article
    className={cn('px-1 py-0.5', messageTone(props.message), messageDeliveryTone(props.message))}
    data-message-delivery={props.message.delivery === 'server-history' ? props.message.delivery : undefined}
    data-message-id={props.message.id}
  >
    <div className="min-w-0">
      <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--transcript-meta)]">
        <time
          className="tabular-nums normal-case tracking-normal"
          dateTime={formatMessageTimestampDateTime(props.message.ts)}
          title={formatMessageTimestampTitle(props.message.ts)}
        >
          {formatMessageTime(props.message.ts)}
        </time>
        {props.participant.label ? (
          <ParticipantNickLabel
            nick={props.participant.label}
            identity={props.message.senderIdentity}
            emoji={props.participant.emoji}
            clickable={props.participant.clickable}
            onOpenParticipantQuery={props.onOpenParticipantQuery}
            className={cn('font-medium opacity-90', props.participant.toneClassName)}
          />
        ) : null}
        {props.participant.kindBadgeLabel ? <span className="text-muted-foreground/65">{props.participant.kindBadgeLabel}</span> : null}
      </div>
      <p
        className={cn(
          'whitespace-pre-wrap break-words font-sans text-[15px] leading-6 text-inherit',
          isActionMessage(props.message) && 'italic',
        )}
      >
        <FormattedMessageText
          text={props.message.body}
          inlineImageRendering={props.inlineImageRendering}
          mode={props.mode}
          onInlinePreviewLoad={props.onInlinePreviewLoad}
          onOpenChannel={props.onOpenChannel}
        />
      </p>
    </div>
  </article>
);
