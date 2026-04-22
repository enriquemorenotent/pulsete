import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { ParticipantNickLabel } from './ParticipantNickLabel.js';
import {
  formatMessageTime,
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  isActionMessage,
  messageTone,
} from './chat-pane-message-utils.js';
import type { ChatMessage } from '../../shared/protocol.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { MessageParticipantPresentation } from './message-participant-presentation.js';

export const ChatPaneExpandedMessageRow = (props: {
  message: ChatMessage;
  mode: MessageDisplayMode;
  onOpenChannel: (channel: string) => void;
  onOpenParticipantQuery?: (nick: string) => void;
  participant: MessageParticipantPresentation;
}) => (
  <article
    className={cn('px-1 py-0.5 text-foreground', messageTone(props.message))}
    data-message-id={props.message.id}
  >
    <div className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
            clickable={props.participant.clickable}
            onOpenParticipantQuery={props.onOpenParticipantQuery}
            className={cn('font-medium', props.participant.toneClassName)}
          />
        ) : null}
        {props.participant.kindBadgeLabel ? <span>{props.participant.kindBadgeLabel}</span> : null}
      </div>
      <p
        className={cn(
          'whitespace-pre-wrap break-words font-sans text-[13px] leading-5 text-inherit',
          isActionMessage(props.message) && 'italic',
        )}
      >
        <FormattedMessageText
          text={props.message.body}
          mode={props.mode}
          onOpenChannel={props.onOpenChannel}
        />
      </p>
    </div>
  </article>
);
