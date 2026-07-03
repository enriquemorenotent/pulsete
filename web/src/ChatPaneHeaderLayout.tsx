import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { ChatPaneHeaderActionMenu } from './ChatPaneHeaderActionMenu.js';
import type { ChatPaneHeaderAction } from './chat-pane-header-actions.js';
import { headerIconButtonClass } from './header-icon-button-style.js';
import type { WorkspaceView } from './workspace.js';

export function PaneHeaderActions(props: {
  title: string;
  primary: ChatPaneHeaderAction[];
  contactControls?: ReactNode;
  overflow: ChatPaneHeaderAction[];
}) {
  if (props.primary.length === 0 && !props.contactControls && props.overflow.length === 0) {
    return null;
  }
  const closeActions = props.primary.filter(isCloseAction);
  const regularActions = props.primary.filter((action) => !isCloseAction(action));

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {regularActions.map((action) => (
        <Button key={action.id} variant="outline" size="sm" onClick={action.onSelect}>
          {action.label}
        </Button>
      ))}
      {props.contactControls}
      <ChatPaneHeaderActionMenu actions={props.overflow} />
      {closeActions.map((action) => (
        <Button
          key={action.id}
          type="button"
          size="icon"
          variant="ghost"
          className={headerIconButtonClass()}
          aria-label={`Close ${props.title}`}
          onClick={action.onSelect}
        >
          <X className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}

const isCloseAction = (action: ChatPaneHeaderAction) =>
  action.id === 'close-channel' || action.id === 'close-query';

export function PaneHeader(props: {
  actions: ReactNode;
  avatar?: ReactNode;
  emoji?: string | null;
  subtitle: string;
  title: string;
  topicBar?: ReactNode;
}) {
  return (
    <div className="relative z-20 shrink-0 border-b border-white/6 bg-background/90 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {props.avatar}
          <div className="min-w-0">
            {props.title ? (
              <h2
                className={cn(
                  'flex min-w-0 items-center truncate text-lg font-semibold tracking-tight text-foreground',
                  'gap-2',
                  props.subtitle && 'mb-1',
                )}
              >
                <span className="truncate">{props.title}</span>
                {props.emoji ? (
                  <span aria-hidden className="shrink-0 leading-none">
                    {props.emoji}
                  </span>
                ) : null}
              </h2>
            ) : null}
            {props.subtitle ? (
              <p className="max-w-xl truncate text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
                {props.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {props.actions}
      </div>
      {props.topicBar ? props.topicBar : null}
    </div>
  );
}

export function shouldShowChatPaneHeaderSubtitle(
  workspace: WorkspaceView,
  subtitle: string,
) {
  if (!subtitle) {
    return false;
  }

  return subtitle !== resolveConnectedRuntimeSubtitle(workspace);
}

function resolveConnectedRuntimeSubtitle(workspace: WorkspaceView) {
  const network = workspace.selectedNetwork;
  if (!network) {
    return null;
  }

  const runtimeNick = workspace.selectedRuntime?.nick ?? network.nick;
  const runtimeHost = workspace.selectedRuntime?.serverName ?? 'server';
  return `${runtimeNick} @ ${runtimeHost}`;
}
