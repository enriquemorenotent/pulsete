import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { resolveChatPaneStatusBanner } from './chat-pane-status.js';
import type { WorkspaceView } from './workspace-types.js';

type ChatPaneStatusBannerProps = {
  workspace: WorkspaceView;
  onReconnectNetwork?: () => Promise<boolean>;
  onRejoinChannel: (channel: string) => void;
};

export function ChatPaneStatusBanner(props: ChatPaneStatusBannerProps) {
  const banner = resolveChatPaneStatusBanner(props.workspace);
  if (!banner) {
    return null;
  }

  const handleAction = () => {
    if (!banner.action) {
      return;
    }
    if (banner.action.kind === 'reconnect') {
      void props.onReconnectNetwork?.();
      return;
    }
    props.onRejoinChannel(banner.action.channel);
  };

  return (
    <div className="shrink-0 px-4 pt-3">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3',
          banner.tone === 'warning'
            ? 'border-amber-300/20 bg-amber-300/8'
            : 'border-white/[0.08] bg-white/[0.03]',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                banner.tone === 'warning'
                  ? 'bg-amber-300/14 text-amber-300'
                  : 'bg-white/[0.06] text-muted-foreground',
              )}
            >
              {banner.title}
            </span>
          </div>
          <p className="text-[13px] leading-5 text-foreground/88">{banner.body}</p>
        </div>
        {banner.action ? (
          <Button variant="outline" size="sm" onClick={handleAction}>
            {banner.action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
