import { cn } from '@/lib/utils.js';
import { getConnectionLabelParts, type WorkspaceView } from './workspace.js';

type ChatPaneModeLineProps = {
  workspace: WorkspaceView;
};

type ModeLineSegment = {
  label: string;
  value: string;
  valueClassName?: string;
  wide?: boolean;
};

export function ChatPaneModeLine(props: ChatPaneModeLineProps) {
  const segments = buildChatPaneModeLineSegments(props.workspace);
  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-white/6 bg-black/12 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={cn(
              'flex min-w-0 items-baseline gap-1.5',
              segment.wide && 'min-w-full xl:min-w-0 xl:flex-1',
            )}
          >
            <span>{segment.label}</span>
            <span className={cn('truncate normal-case tracking-normal text-foreground/88', segment.valueClassName)}>
              {segment.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const buildChatPaneModeLineSegments = (workspace: WorkspaceView): ModeLineSegment[] => {
  const network = workspace.selectedNetwork;
  if (!network) {
    return [];
  }

  const runtime = workspace.selectedRuntime;
  const connectionParts = getConnectionLabelParts(
    workspace.connectionInstances,
    network,
    runtime,
  );
  const hostLabel = runtime?.serverName ?? network.host;
  const buffer = workspace.selectedBuffer;
  const pendingChannel = workspace.selectedPendingChannel;
  const unread = buffer?.unread ?? 0;
  const mentions = buffer?.priorityUnread ?? 0;
  const state = resolveModeLineState(workspace);
  const segments: ModeLineSegment[] = [];

  if (state) {
    segments.push({
      label: 'State',
      value: state.label,
      valueClassName: state.className,
    });
  }

  if (buffer?.kind === 'server' || state || connectionParts.instanceIndex !== null) {
    segments.push({
      label: connectionParts.instanceIndex === null ? 'Host' : 'Net',
      value: connectionParts.instanceIndex === null
        ? hostLabel
        : `${connectionParts.name} #${connectionParts.instanceIndex}`,
    });
  }

  if (connectionParts.nick !== network.nick) {
    segments.push({
      label: 'Nick',
      value: connectionParts.nick,
    });
  }

  if (pendingChannel) {
    segments.push({
      label: 'Join',
      value: pendingChannel.channel,
    });
  }

  if (buffer && buffer.kind !== 'server') {
    if (unread > 0) {
      segments.push({
        label: 'Unread',
        value: String(unread),
        valueClassName: 'text-foreground',
      });
    }
    if (mentions > 0) {
      segments.push({
        label: 'Mentions',
        value: String(mentions),
        valueClassName: 'text-primary',
      });
    }
  }

  const topic = workspace.selectedChannel?.topic.trim();
  if (topic) {
    segments.push({
      label: 'Topic',
      value: topic,
      wide: true,
    });
  }

  return segments;
};

export const shouldShowChatPaneHeaderSubtitle = (
  workspace: WorkspaceView,
  subtitle: string,
) => {
  if (!subtitle) {
    return false;
  }
  return subtitle !== resolveConnectedRuntimeSubtitle(workspace);
};

const resolveConnectedRuntimeSubtitle = (workspace: WorkspaceView) => {
  const network = workspace.selectedNetwork;
  if (!network) {
    return null;
  }
  const runtimeNick = workspace.selectedRuntime?.nick ?? network.nick;
  const runtimeHost = workspace.selectedRuntime?.serverName ?? 'server';
  return `${runtimeNick} @ ${runtimeHost}`;
};

const resolveModeLineState = (workspace: WorkspaceView) => {
  if (workspace.mode === 'channel-pending') {
    return {
      label: 'Joining',
      className: 'text-amber-300',
    };
  }

  const phase = workspace.selectedRuntime?.phase ?? 'offline';
  if (phase === 'connected') {
    return null;
  }
  if (phase === 'connecting') {
    return {
      label: 'Connecting',
      className: 'text-amber-300',
    };
  }
  return {
    label: 'Offline',
    className: 'text-muted-foreground',
  };
};
