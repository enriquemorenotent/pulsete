import { Plug2 } from 'lucide-react';

export const TranscriptEmptyState = (props: { body: string }) => (
  <div className="flex h-full items-center justify-center" data-scroll-anchor-item>
    <div className="w-full max-w-md rounded-[1.25rem] bg-white/[0.03] px-5 py-6 text-center ring-1 ring-white/[0.06]">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground">
        <Plug2 className="size-4 text-muted-foreground" />
      </div>
      <p className="text-[13px] leading-6 text-muted-foreground">{props.body}</p>
    </div>
  </div>
);

export const UnreadDivider = () => (
  <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-primary">
    <span className="h-px flex-1 bg-primary/35" />
    <span>New messages</span>
    <span className="h-px flex-1 bg-primary/35" />
  </div>
);

export const DayDivider = (props: { label: string }) => (
  <div className="sticky top-0 z-10 -mx-4 mb-3 bg-background/80 px-4 py-2 backdrop-blur-sm">
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
      <span className="h-px flex-1 bg-border/60" />
      <span>{props.label}</span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  </div>
);
