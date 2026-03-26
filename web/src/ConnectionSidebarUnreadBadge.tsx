import { cn } from '@/lib/utils.js';

type ConnectionSidebarActivityBadgeProps = {
  count: number;
  priority?: boolean;
};

export function ConnectionSidebarActivityBadge(props: ConnectionSidebarActivityBadgeProps) {
  return (
    <span
      className={cn(
        'ml-auto rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-normal',
        props.priority
          ? 'border-primary/60 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground'
      )}
    >
      {props.count}
    </span>
  );
}
