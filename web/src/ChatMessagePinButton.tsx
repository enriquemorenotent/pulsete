import { useState } from 'react';
import { Pin } from 'lucide-react';
import type { ChatMessage } from '../../shared/protocol-chat.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

export const isPinnableChatMessage = (message: ChatMessage) =>
  message.kind === 'line' || message.kind === 'action';

export function ChatMessagePinButton(props: {
  message: ChatMessage;
  onSetMessagePinned: (bufferId: string, messageId: string, pinned: boolean) => Promise<boolean>;
}) {
  const [pending, setPending] = useState(false);
  const pinned = props.message.pinnedAt != null;

  const togglePin = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    try {
      await props.onSetMessagePinned(
        props.message.bufferId,
        props.message.id,
        !pinned,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={pinned ? 'Unpin message' : 'Pin message'}
      aria-pressed={pinned}
      title={pinned ? 'Unpin message' : 'Pin message'}
      disabled={pending}
      className={cn(
        'absolute right-1 top-1 z-10 size-7 bg-background/80 shadow-sm backdrop-blur-sm transition-opacity',
        pinned
          ? 'text-primary opacity-100 hover:text-primary'
          : 'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-visible:opacity-100',
      )}
      onClick={() => void togglePin()}
    >
      <Pin aria-hidden className={cn('size-3.5', pinned && 'fill-current')} />
    </Button>
  );
}
