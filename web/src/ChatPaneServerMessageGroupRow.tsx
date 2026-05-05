import { useMemo } from 'react';
import type { ChatMessage } from '../../shared/protocol-chat.js';
import { cn } from '@/lib/utils.js';
import {
  FormattedMessageInlinePreviews,
  FormattedMessageText,
  hasVisibleFormattedMessageText,
  parseFormattedMessageContent,
} from './FormattedMessageText.js';
import {
  formatMessageTime,
  formatMessageTimestampDateTime,
  formatMessageTimestampTitle,
  getServerMessageDisplayBody,
  messageTone,
} from './chat-pane-message-utils.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type {
  ChatTranscriptMessageRow,
  ChatTranscriptServerGroupRow,
} from './transcript/model.js';

type ChatPaneServerMessageGroupRowProps = {
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  row: ChatTranscriptServerGroupRow;
};

export function ChatPaneServerMessageGroupRow(props: ChatPaneServerMessageGroupRowProps) {
  return (
    <section
      className="px-1 py-1.5 font-sans"
      data-server-message-group-source={props.row.sourceLabel}
    >
      <div className="min-w-0 border-t border-white/[0.035] pt-1.5">
        <p
          className={cn(
            'mb-0.5 truncate font-mono text-[10px] uppercase leading-4 tracking-[0.12em]',
            props.row.tone === 'notice'
              ? 'text-[var(--transcript-notice)]'
              : 'text-muted-foreground/62',
          )}
          title={props.row.sourceLabel}
        >
          {props.row.sourceLabel}
        </p>
        {props.row.messageRows.map((messageRow) => (
          <ServerMessageGroupLine
            key={messageRow.key}
            mode={props.mode}
            onInlinePreviewLoad={props.onInlinePreviewLoad}
            onOpenChannel={props.onOpenChannel}
            row={messageRow}
          />
        ))}
      </div>
    </section>
  );
}

function ServerMessageGroupLine(props: {
  mode: MessageDisplayMode;
  onInlinePreviewLoad?: () => void;
  onOpenChannel: (channel: string) => void;
  row: ChatTranscriptMessageRow;
}) {
  const { message } = props.row;
  const displayText = getServerMessageDisplayBody(message);
  const parsedContent = useMemo(
    () => parseFormattedMessageContent(displayText, props.mode),
    [displayText, props.mode],
  );
  const hasVisibleText = hasVisibleFormattedMessageText(parsedContent);

  return (
    <div
      className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 py-0.5"
      data-message-id={message.id}
    >
      <ServerMessageTimestamp message={message} />
      <div className="min-w-0">
        {hasVisibleText ? (
          <p className={cn('min-w-0 break-words text-[13px] leading-5', messageTone(message))}>
            <FormattedMessageText
              text={displayText}
              mode={props.mode}
              onInlinePreviewLoad={props.onInlinePreviewLoad}
              onOpenChannel={props.onOpenChannel}
              parsedContent={parsedContent}
              renderInlinePreviews={false}
            />
          </p>
        ) : null}
        <FormattedMessageInlinePreviews
          hrefs={parsedContent.inlineImageHrefs}
          onInlinePreviewLoad={props.onInlinePreviewLoad}
        />
      </div>
    </div>
  );
}

function ServerMessageTimestamp(props: {
  message: ChatMessage;
}) {
  return (
    <time
      className="shrink-0 font-sans tabular-nums text-[11px] leading-5 text-muted-foreground/58"
      dateTime={formatMessageTimestampDateTime(props.message.ts)}
      title={formatMessageTimestampTitle(props.message.ts)}
    >
      {formatMessageTime(props.message.ts)}
    </time>
  );
}
