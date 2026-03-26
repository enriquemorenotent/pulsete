import type { ComponentType } from 'react';
import { X } from 'lucide-react';
import type { BufferState } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './buffer-activity.js';
import { ConnectionSidebarActivityBadge } from './ConnectionSidebarUnreadBadge.js';

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
  const activity = resolveBufferActivityState(props.buffer);

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
        <span
          className={cn(
            'truncate text-[13px]',
            activity.priority ? 'font-semibold text-foreground' : 'text-foreground',
            activity.hasUnread && !activity.priority && 'font-medium text-foreground',
            props.dimmed && !activity.hasUnread && 'text-muted-foreground'
          )}
        >
          {props.buffer.target}
        </span>
        {activity.hasUnread ? (
          <ConnectionSidebarActivityBadge count={activity.count} priority={activity.priority} />
        ) : null}
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
