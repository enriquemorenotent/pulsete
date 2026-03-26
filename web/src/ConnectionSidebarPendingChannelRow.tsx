import { Hash, LoaderCircle } from 'lucide-react';
import type { PendingChannelState } from '../../shared/protocol.js';
import { cn } from '@/lib/utils.js';

type ConnectionSidebarPendingChannelRowProps = {
  pendingChannel: PendingChannelState;
  selected: boolean;
  onSelect: () => void;
};

export function ConnectionSidebarPendingChannelRow(props: ConnectionSidebarPendingChannelRowProps) {
  return (
    <div
      className={cn(
        'flex items-stretch rounded-lg transition-colors',
        props.selected
          ? 'bg-white/[0.05] ring-1 ring-inset ring-white/[0.08]'
          : 'hover:bg-white/[0.03]'
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
        onClick={props.onSelect}
        aria-label={`Open pending ${props.pendingChannel.channel}`}
      >
        <Hash className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-foreground">{props.pendingChannel.channel}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />
          joining
        </span>
      </button>
    </div>
  );
}
