import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import type {
  AssistantPanelMetaSegment,
  AssistantPanelStatusState,
} from './assistant-panel-status.js';

type AssistantPanelHeaderProps = {
  assistantReady: boolean;
  metaSegments: AssistantPanelMetaSegment[];
  onNewChat: () => Promise<void>;
  panelTitle: string;
  showNewChat: boolean;
  statusState: AssistantPanelStatusState | null;
};

export function AssistantPanelHeader(props: AssistantPanelHeaderProps) {
  return (
    <>
      {props.statusState ? (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]',
                props.statusState.tone === 'danger'
                  ? 'bg-rose-400/10 text-rose-300'
                  : 'bg-white/[0.06] text-muted-foreground'
              )}
            >
              {props.statusState.label}
            </span>
            {props.statusState.detail ? (
              <p
                className={cn(
                  'min-w-0 flex-1 text-[12px]',
                  props.statusState.tone === 'danger' ? 'text-rose-200' : 'text-muted-foreground'
                )}
              >
                {props.statusState.detail}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="space-y-2.5 border-b border-white/[0.06] bg-transparent px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Assistant</p>
            <p className="truncate text-sm font-medium text-foreground">{props.panelTitle}</p>
          </div>
          {props.showNewChat ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!props.assistantReady}
              onClick={() => void props.onNewChat()}
            >
              New chat
            </Button>
          ) : null}
        </div>
        {props.metaSegments.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {props.metaSegments.map((segment) => (
              <div key={segment.label} className="flex min-w-0 items-baseline gap-1.5">
                <span>{segment.label}</span>
                <span
                  className={cn(
                    'truncate normal-case tracking-normal',
                    segment.tone === 'warning' ? 'text-amber-300' : 'text-foreground/88'
                  )}
                >
                  {segment.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
