import { Hash, LoaderCircle } from 'lucide-react';
import type { PendingChannelState } from '../../shared/protocol-chat.js';
import { cn } from '@/lib/utils.js';
import { connectionSidebarRowClass } from './connection-sidebar-label-class.js';

type ConnectionSidebarPendingChannelRowProps = {
  pendingChannel: PendingChannelState;
  selected: boolean;
  onSelect: () => void;
};

export function ConnectionSidebarPendingChannelRow(props: ConnectionSidebarPendingChannelRowProps) {
  const activity = { hasUnread: false, priority: false };

  return (
    <div
      className={connectionSidebarRowClass(activity, { selected: props.selected })}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        onClick={props.onSelect}
        aria-label={`Open pending ${props.pendingChannel.channel}`}
      >
        <Hash className="size-3.5 shrink-0 text-muted-foreground/80" />
        <span
          className={cn(
            'block min-w-0 flex-1 truncate text-[12px] font-medium',
            props.selected ? 'text-foreground' : 'text-muted-foreground/90',
          )}
        >
          {props.pendingChannel.channel}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <LoaderCircle className="size-2.5 animate-spin" />
          joining
        </span>
      </button>
    </div>
  );
}
