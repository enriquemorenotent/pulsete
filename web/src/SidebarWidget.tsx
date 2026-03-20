import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

type SidebarWidgetProps = {
  title: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function SidebarWidget(props: SidebarWidgetProps) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden border border-border bg-card', props.className)}>
      <div className="flex items-center justify-between border-b border-border/70 bg-background/50 px-3 py-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{props.title}</h2>
        {props.actions ? <div className="flex items-center gap-1">{props.actions}</div> : null}
      </div>
      <div className={cn('min-h-0', props.bodyClassName)}>{props.children}</div>
    </section>
  );
}
