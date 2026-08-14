import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

type InspectorPanelProps = {
  children: ReactNode;
  className?: string;
};

export function InspectorPanel(props: InspectorPanelProps) {
  return (
    <aside className={cn('flex h-full min-h-0 flex-col gap-5 bg-[#15181c] px-4 py-4', props.className)}>
      {props.children}
    </aside>
  );
}

type InspectorHeaderProps = {
  actions?: ReactNode;
  eyebrow: string;
  subtitle?: string;
  title: ReactNode;
};

export function InspectorHeader(props: InspectorHeaderProps) {
  return (
    <header className="group shrink-0 space-y-2 border-b border-white/[0.045] pb-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/72">
        {props.eyebrow}
      </p>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight text-foreground/92">
            {props.title}
          </h2>
          {props.subtitle ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/72">
              {props.subtitle}
            </p>
          ) : null}
        </div>
        {props.actions ? (
          <div className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            {props.actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

type InspectorSectionProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function InspectorSection(props: InspectorSectionProps) {
  return (
    <section className={cn('min-w-0 space-y-2.5', props.className)}>
      {props.title ? (
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/72">
          {props.title}
        </h3>
      ) : null}
      {props.children}
    </section>
  );
}

type MetadataRowProps = {
  label: string;
  value: ReactNode;
};

export function MetadataRow(props: MetadataRowProps) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[12px] leading-5">
      <dt className="text-muted-foreground/72">{props.label}</dt>
      <dd className="min-w-0 truncate text-foreground/76">{props.value}</dd>
    </div>
  );
}
