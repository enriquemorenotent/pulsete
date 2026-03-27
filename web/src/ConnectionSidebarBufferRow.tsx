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

export function ConnectionSidebarBufferRow(
  props: ConnectionSidebarBufferRowProps,
) {
  const Icon = props.icon;
  const activity = resolveBufferActivityState(props.buffer);

  return (
    <div
      className={cn(
        'group flex items-stretch rounded-lg transition-colors',
        props.selected
          ? 'bg-white/[0.05] ring-1 ring-inset ring-white/[0.08]'
          : 'hover:bg-white/[0.03]',
      )}
    >
      <button
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left',
          props.dimmed && 'opacity-70',
        )}
        onClick={props.onSelect}
        aria-label={`Open ${props.buffer.target}`}
      >
        <Icon
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground',
            props.selected && 'text-primary/80',
          )}
        />
        <span
          className={cn(
            'truncate text-[13px]',
            activity.priority
              ? 'font-semibold text-foreground'
              : 'text-foreground',
            activity.hasUnread &&
              !activity.priority &&
              'font-medium text-foreground',
            props.dimmed && !activity.hasUnread && 'text-muted-foreground',
          )}
        >
          {props.buffer.target}
        </span>
        {activity.hasUnread ? (
          <ConnectionSidebarActivityBadge
            count={activity.count}
            priority={activity.priority}
          />
        ) : null}
      </button>
      <button
        className="px-3 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-foreground"
        onClick={props.onClose}
        aria-label={`Close ${props.buffer.target}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
