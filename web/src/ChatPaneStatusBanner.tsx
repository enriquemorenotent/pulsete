import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import type { WorkspaceView } from './workspace-types.js';

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
    <div className="shrink-0 space-y-1.5 px-4 pt-2">
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
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2',
        props.tone === 'warning'
          ? 'border-amber-300/16 bg-amber-300/[0.045]'
          : 'border-white/[0.07] bg-white/[0.025]',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase leading-4 tracking-[0.14em]',
            props.tone === 'warning'
              ? 'bg-amber-300/10 text-amber-300'
              : 'bg-white/[0.05] text-muted-foreground',
          )}
        >
          {props.title}
        </span>
        <p className="min-w-[14rem] flex-1 text-[12px] leading-5 text-foreground/78">
          {props.body}
        </p>
      </div>
      {props.actionLabel && props.onAction ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2.5"
          onClick={props.onAction}
        >
          {props.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
