import type { ReactNode } from 'react';
import { Download, Search, Trash2, UserSearch, X } from 'lucide-react';
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
  const iconActions = props.primary.filter(
    (action) => action.icon && !isCloseAction(action),
  );
  const regularActions = props.primary.filter((action) => !action.icon);
  const compactMenuActions = [...iconActions, ...props.overflow];

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
      {regularActions.map((action) => (
        <Button key={action.id} variant="outline" size="sm" onClick={action.onSelect}>
          {action.label}
        </Button>
      ))}
      {props.contactControls}
      {iconActions.length > 0 || props.overflow.length > 0 ? (
        <>
          <div className="hidden items-center gap-1.5 sm:flex">
            {iconActions.map((action) => (
              <PaneHeaderIconAction key={action.id} action={action} title={props.title} />
            ))}
            <ChatPaneHeaderActionMenu actions={props.overflow} />
          </div>
          <div className="sm:hidden">
            <ChatPaneHeaderActionMenu actions={compactMenuActions} />
          </div>
        </>
      ) : null}
      {closeActions.map((action) => (
        <PaneHeaderIconAction key={action.id} action={action} title={props.title} />
      ))}
    </div>
  );
}

const isCloseAction = (action: ChatPaneHeaderAction) =>
  action.icon === 'close';

const headerActionIconPresentations = {
  close: {
    Icon: X,
    iconClassName: 'size-3.5',
    label: (_action: ChatPaneHeaderAction, title: string) => `Close ${title}`,
  },
  'delete-history': {
    Icon: Trash2,
    iconClassName: 'size-4',
    label: (action: ChatPaneHeaderAction) => action.label,
  },
  'download-history': {
    Icon: Download,
    iconClassName: 'size-4',
    label: (action: ChatPaneHeaderAction) => action.label,
  },
  'search-history': {
    Icon: Search,
    iconClassName: 'size-4',
    label: (action: ChatPaneHeaderAction) => action.label,
  },
  whois: {
    Icon: UserSearch,
    iconClassName: 'size-4',
    label: (action: ChatPaneHeaderAction, title: string) => `${action.label} ${title}`,
  },
} satisfies Record<
  NonNullable<ChatPaneHeaderAction['icon']>,
  {
    Icon: typeof X;
    iconClassName: string;
    label: (action: ChatPaneHeaderAction, title: string) => string;
  }
>;

function PaneHeaderIconAction(props: {
  action: ChatPaneHeaderAction;
  title: string;
}) {
  if (!props.action.icon) {
    return null;
  }
  const presentation = headerActionIconPresentations[props.action.icon];
  const label = presentation.label(props.action, props.title);
  const Icon = presentation.Icon;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        headerIconButtonClass(),
        props.action.tone === 'danger'
          && 'text-rose-300 hover:border-rose-300/25 hover:bg-rose-400/10 hover:text-rose-200',
      )}
      aria-label={label}
      title={label}
      onClick={props.action.onSelect}
    >
      <Icon className={presentation.iconClassName} />
    </Button>
  );
}

export function PaneHeader(props: {
  actions: ReactNode;
  avatar?: ReactNode;
  emoji?: string | null;
  subtitle: string;
  title: string;
  topicBar?: ReactNode;
}) {
  const identity = (
    <div className="min-w-0">
      {props.title ? (
        <h2
          className={cn(
            'flex min-w-0 items-center truncate text-[18px] font-semibold tracking-tight text-[#edf0f2]',
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
  );

  return (
    <div className="relative z-20 shrink-0 border-b border-[#292d33] bg-[#101215]">
      {props.avatar ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-4">
          <div className="-my-4 -ml-4 shrink-0">
            {props.avatar}
          </div>
          {identity}
          <div className="min-w-0">
            {props.actions}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[72px] items-center justify-between gap-4 px-5 py-3">
          {identity}
          {props.actions}
        </div>
      )}
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
