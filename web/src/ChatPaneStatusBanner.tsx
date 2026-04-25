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
    <div className="shrink-0 space-y-3 px-4 pt-3">
      {props.mutedQueryNick ? (
        <BannerCard
          tone="muted"
          title="Muted"
          body={`Messages from ${props.mutedQueryNick} are collapsed here and won’t create unread or notification activity.`}
        />
      ) : null}
      {banner ? (
        <BannerCard
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

function BannerCard(props: {
  tone: 'muted' | 'warning';
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3',
        props.tone === 'warning'
          ? 'border-amber-300/20 bg-amber-300/8'
          : 'border-white/[0.08] bg-white/[0.03]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
              props.tone === 'warning'
                ? 'bg-amber-300/14 text-amber-300'
                : 'bg-white/[0.06] text-muted-foreground',
            )}
          >
            {props.title}
          </span>
        </div>
        <p className="text-[13px] leading-5 text-foreground/88">{props.body}</p>
      </div>
      {props.actionLabel && props.onAction ? (
        <Button variant="outline" size="sm" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
