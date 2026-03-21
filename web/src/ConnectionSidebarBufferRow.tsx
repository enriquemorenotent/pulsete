import type { ComponentType } from 'react';
import { X } from 'lucide-react';
import type { BufferState } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { ConnectionSidebarUnreadBadge } from './ConnectionSidebarUnreadBadge.js';

type ConnectionSidebarBufferRowProps = {
  buffer: BufferState;
  dimmed: boolean;
  selected: boolean;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  onClose: () => void;
};

export function ConnectionSidebarBufferRow(props: ConnectionSidebarBufferRowProps) {
  const Icon = props.icon;

  return (
    <div className={cn('flex items-stretch rounded-sm', props.selected && 'bg-accent')}>
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/70',
          props.dimmed && 'opacity-70'
        )}
        onClick={props.onSelect}
        aria-label={`Open ${props.buffer.target}`}
      >
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className={cn('truncate text-[13px] text-foreground', props.dimmed && 'text-muted-foreground')}>
          {props.buffer.target}
        </span>
        {props.buffer.unread > 0 ? <ConnectionSidebarUnreadBadge unread={props.buffer.unread} /> : null}
      </button>
      <button
        className="px-2 text-muted-foreground transition-colors hover:bg-accent/70 hover:text-accent-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
