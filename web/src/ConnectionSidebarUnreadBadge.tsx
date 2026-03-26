import { cn } from '@/lib/utils.js';

type ConnectionSidebarActivityBadgeProps = {
  count: number;
  priority?: boolean;
};

export function ConnectionSidebarActivityBadge(props: ConnectionSidebarActivityBadgeProps) {
  return (
    <span
      className={cn(
        'ml-auto rounded-full px-1.5 py-0.5 font-mono text-[10px] tracking-normal',
        props.priority
          ? 'bg-primary/14 text-primary'
          : 'bg-white/[0.05] text-muted-foreground'
      )}
    >
      {props.count}
    </span>
  );
}
