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
    <section className={cn('flex min-h-0 flex-col overflow-hidden', props.className)}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{props.title}</h2>
        {props.actions ? <div className="flex items-center gap-1">{props.actions}</div> : null}
      </div>
      <div className={cn('min-h-0 overflow-hidden rounded-[1rem] bg-black/10 ring-1 ring-white/[0.05]', props.bodyClassName)}>
        {props.children}
      </div>
    </section>
  );
}
