import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import type { WorkspaceView } from './workspace-types.js';

const statusActionClassName =
  'h-9 w-full shrink-0 rounded-md sm:w-auto border border-amber-300/50 bg-amber-300 px-4 text-sm font-semibold text-[#28200e] hover:bg-amber-200';

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
    <div className="shrink-0 space-y-2 px-4 py-3">
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
        'flex min-h-14 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center rounded-lg border px-4 py-3',
        props.tone === 'warning' || props.title === 'Offline'
          ? 'border-amber-300/30 bg-amber-300/10'
          : 'border-border bg-secondary/50',
      )}
    >
      <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            props.tone === 'warning' || props.title === 'Offline' ? 'bg-amber-300' : 'bg-muted-foreground',
          )}
        />
        <span
          className={cn(
            'shrink-0 text-xs font-semibold uppercase leading-4 tracking-wider',
            props.tone === 'warning' || props.title === 'Offline'
              ? 'text-amber-200'
              : 'text-muted-foreground',
          )}
        >
          {props.title}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-white/[0.07]" />
        <p className="min-w-0 flex-1 basis-full text-sm sm:basis-40 leading-5 text-foreground">
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
