import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import type { WorkspaceView } from './workspace-types.js';

const statusActionClassName =
  'h-6 shrink-0 rounded-sm border border-white/[0.055] px-2 text-[11px] text-muted-foreground/78 hover:border-white/12 hover:bg-white/[0.045] hover:text-foreground';

type ChatPaneStatusBannerProps = {
  workspace: WorkspaceView;
  mutedQueryNick?: string | null;
  onReconnectNetwork?: () => Promise<boolean>;
  onRejoinChannel: (channel: string) => void;
};

export function ChatPaneStatusBanner(props: ChatPaneStatusBannerProps) {
  const banner = resolveChatPaneStatusBanner(props.workspace);
  if (!banner && !props.mutedQueryNick) {
    return null;
  }

  return (
    <div className="shrink-0 space-y-1 px-4 pt-1.5">
      {props.mutedQueryNick ? (
        <StatusStrip
          tone="muted"
          title="Muted"
          body={`Messages from ${props.mutedQueryNick} are collapsed here and won’t create unread or notification activity.`}
        />
      ) : null}
      {banner ? (
        <StatusStrip
          tone={banner.tone}
          title={banner.title}
          body={banner.body}
          actionLabel={banner.action?.label}
          onAction={() => {
            if (!banner.action) {
              return;
            }
            if (banner.action.kind === 'reconnect') {
              void props.onReconnectNetwork?.();
              return;
            }
            props.onRejoinChannel(banner.action.channel);
          }}
        />
      ) : null}
    </div>
  );
}

function StatusStrip(props: {
  tone: 'muted' | 'warning';
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-8 items-center justify-between gap-3 border-b py-1.5',
        props.tone === 'warning'
          ? 'border-amber-300/12'
          : 'border-white/[0.045]',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            props.tone === 'warning' ? 'bg-amber-300/70' : 'bg-muted-foreground/45',
          )}
        />
        <span
          className={cn(
            'shrink-0 font-mono text-[10px] uppercase leading-4 tracking-[0.14em]',
            props.tone === 'warning'
              ? 'text-amber-200/78'
              : 'text-muted-foreground/62',
          )}
        >
          {props.title}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-white/[0.07]" />
        <p className="min-w-0 flex-1 truncate text-[12px] leading-5 text-muted-foreground/72">
          {props.body}
        </p>
      </div>
      {props.actionLabel && props.onAction ? (
        <Button
          variant="ghost"
          size="sm"
          className={statusActionClassName}
          onClick={props.onAction}
        >
          {props.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
