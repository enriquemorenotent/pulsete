import type { ChatMessage } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { FormattedMessageText } from './FormattedMessageText.js';
import { MessageAvatar } from './MessageAvatar.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import {
  formatMessageTime,
  isActionBody,
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
  const actionBody = isActionBody(message);
  const showNick = message.nick && (message.kind === 'line' || showKindLabel(message));
  const avatarNick = showNick ? message.nick : null;

  return (
    <article className={cn('border px-2 py-1.5', messageTone(message))}>
      <div className={cn('grid gap-x-3', avatarNick ? 'grid-cols-[2.75rem_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]')}>
        {avatarNick ? (
          <div className="pt-0.5">
            <MessageAvatar nick={avatarNick} />
          </div>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] leading-5">
          <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {formatMessageTime(message.ts)}
          </span>
          {showNick && !actionBody ? (
            <span className="font-semibold text-foreground">{message.nick}</span>
          ) : null}
          {showKindLabel(message) ? <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{message.kind}</span> : null}
          <span className={cn('min-w-0 break-words font-sans text-[13px] text-foreground', actionBody && 'italic')}>
            <FormattedMessageText text={message.body} mode={props.mode} onOpenChannel={props.onOpenChannel} />
          </span>
        </p>
      </div>
    </article>
  );
}
