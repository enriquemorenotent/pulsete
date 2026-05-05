import { Hash, MessageSquare, Server } from 'lucide-react';
import { cn } from '@/lib/utils.js';

export type ChatPaneComposerTarget = {
  kind: 'channel' | 'query' | 'server';
  label: string;
};

export function ChatPaneComposerTargetChip(props: {
  target: ChatPaneComposerTarget;
  variant: 'commands' | 'normal';
}) {
  return (
    <div
      className={cn(
        'flex h-8 min-w-0 max-w-[7.5rem] shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[12px] font-medium sm:max-w-[12rem]',
        props.variant === 'commands'
          ? 'border-amber-300/20 bg-amber-300/10 text-amber-200'
          : 'border-white/8 bg-white/[0.045] text-foreground/85'
      )}
      aria-label={`Composer target ${props.target.label}`}
      title={props.target.label}
    >
      {props.target.kind === 'server' ? (
        <Server className="size-3.5 shrink-0" aria-hidden="true" />
      ) : props.target.kind === 'query' ? (
        <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Hash className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 truncate">{props.target.label}</span>
    </div>
  );
}
