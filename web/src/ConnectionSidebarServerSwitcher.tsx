import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionSidebarServerIcon } from './ConnectionSidebarServerIcon.js';
import { resolveNetworkServerImage } from './network-server-image.js';
import { Check, Copy, Plug, Unplug, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './transcript/unread-state.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import type { SidebarConnectionView } from './connection-sidebar-view.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

type ConnectionSidebarServerSwitcherProps = ConnectionSidebarProps;

export function ConnectionSidebarServerSwitcher(
  props: ConnectionSidebarServerSwitcherProps,
) {
  const activeConnection = useMemo(
    () => resolveActiveConnection(props.connections),
    [props.connections],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-3 py-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounts</h2>
        <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Open accounts">
          {props.connections.map((connection) => (
            <ServerSwitcherButton key={connection.network.id} connection={connection} active={connection.network.id === activeConnection?.network.id} showMedia={props.showMedia} externalAvatarsEnabled={props.externalAvatarsEnabled} onSelect={() => props.onSelectNetwork(connection.network)} />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ConnectionSwitcherDetail {...props} activeConnection={activeConnection} />
        <ConnectionSidebarFriends
          friends={props.friends}
          friendPresence={props.friendPresence}
          hideOfflineFriends={props.hideOfflineFriends}
          nickEmojis={props.nickEmojis}
          onRemoveFriend={props.onRemoveFriend}
          onSelectFriend={props.onSelectFriend}
          onToggleHideOfflineFriends={props.onToggleHideOfflineFriends}
        />
      </div>
    </section>
  );
}

function ConnectionSwitcherDetail(props: ConnectionSidebarServerSwitcherProps & {
  activeConnection: SidebarConnectionView | null;
}) {
  const activeConnection = props.activeConnection;
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeConnection ? (
        <ServerSwitcherHeader
          connection={activeConnection}
          externalAvatarsEnabled={props.externalAvatarsEnabled}
          showMedia={props.showMedia}
          onSelectNetwork={props.onSelectNetwork}
          onReconnectNetwork={props.onReconnectNetwork}
          onDisconnectNetwork={props.onDisconnectNetwork}
          onCloseConnection={props.onCloseConnection}
        />
      ) : null}
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!w-full">
        <div className="min-w-0 px-2.5 py-1.5 pr-3">
          {props.connections.length === 0 ? (
            <div className="rounded-md bg-black/10 px-2 py-1.5 text-[12px] text-muted-foreground ring-1 ring-white/5">
              No open connections. Use Network Manager to connect.
            </div>
          ) : null}
          {activeConnection ? (
            <ConnectionSidebarNetworkSection
              connection={activeConnection}
              index={0}
              nickEmojis={props.nickEmojis}
              queryPresence={props.queryPresence ?? {}}
              onSelectNetwork={props.onSelectNetwork}
              onSelectBuffer={props.onSelectBuffer}
              onSelectPendingChannel={props.onSelectPendingChannel}
              onReconnectNetwork={props.onReconnectNetwork}
              onDisconnectNetwork={props.onDisconnectNetwork}
              onCloseConnection={props.onCloseConnection}
              onCloseChannel={props.onCloseChannel}
              onCloseBuffer={props.onCloseBuffer}
              showMedia={props.showMedia}
              variant="server-switcher"
            />
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}

function ServerSwitcherHeader(props: {
  connection: SidebarConnectionView;
  externalAvatarsEnabled?: boolean;
  showMedia?: ConnectionSidebarProps['showMedia'];
  onSelectNetwork: ConnectionSidebarProps['onSelectNetwork'];
  onReconnectNetwork: ConnectionSidebarProps['onReconnectNetwork'];
  onDisconnectNetwork: ConnectionSidebarProps['onDisconnectNetwork'];
  onCloseConnection: ConnectionSidebarProps['onCloseConnection'];
}) {
  const phase = props.connection.runtime?.phase ?? 'offline';
  const serverImage = props.showMedia === false ? null : resolveNetworkServerImage(props.connection.network, props.externalAvatarsEnabled === true);
  const actionLabel = phase === 'connected' ? 'Disconnect' : phase === 'connecting' ? 'Connecting' : 'Connect';
  return (
    <header className="mb-4 shrink-0 border-b border-border px-4 py-5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => props.onSelectNetwork(props.connection.network)} aria-label={`Open ${props.connection.labelParts.name}`} title="Open server">
          <span className="block truncate text-base font-semibold text-foreground">{props.connection.labelParts.name}</span>
          <span className="mt-1 block truncate text-sm text-muted-foreground">as {props.connection.labelParts.nick}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {serverImage ? <CopyServerImageUrlButton url={serverImage.url} /> : null}
        <button type="button" className="rounded-md p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground" onClick={() => props.onCloseConnection(props.connection.network)} aria-label={`Close ${props.connection.labelParts.name}`} title="Close server"><X className="size-4" /></button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden className={cn('size-2 rounded-full', phase === 'connected' ? 'bg-emerald-300' : phase === 'connecting' ? 'bg-amber-300 animate-pulse' : 'bg-slate-400')} />{phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting' : 'Offline'}</span>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md border border-primary/30 bg-primary/15 px-3 text-sm font-medium text-primary hover:bg-primary/25 disabled:opacity-50" onClick={() => phase === 'connected' ? props.onDisconnectNetwork(props.connection.network.id) : props.onReconnectNetwork(props.connection.network)} aria-label={`${actionLabel} ${props.connection.labelParts.name}`} title={actionLabel} disabled={phase === 'connecting'}>{phase === 'connected' ? <Unplug className="size-3.5" /> : <Plug className="size-3.5" />}{actionLabel}</button>
      </div>
    </header>
  );
}

function ServerSwitcherButton(props: {
  active: boolean;
  connection: SidebarConnectionView;
  showMedia?: boolean;
  externalAvatarsEnabled?: boolean;
  onSelect: () => void;
}) {
  const activity = resolveConnectionActivity(props.connection);
  const nick = props.connection.labelParts.nick;
  const serverImage = props.showMedia === false ? null : resolveNetworkServerImage(props.connection.network, props.externalAvatarsEnabled === true);
  return (
    <button type="button" className={cn('relative flex min-w-12 flex-1 flex-col items-center gap-2 rounded-lg py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary', props.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground')} onClick={props.onSelect} aria-label={`Open ${props.connection.labelParts.name}${activity.hasUnread ? ' (unread)' : ''}`} title={`${props.connection.labelParts.name} · ${nick}`} aria-pressed={props.active}>
      <span aria-hidden className={cn('relative flex size-10 items-center justify-center overflow-hidden rounded-lg border text-sm font-semibold', props.active ? 'border-primary/60 bg-primary/20 text-primary' : 'border-border bg-secondary text-foreground')}>{serverImage ? <ConnectionSidebarServerIcon className="absolute inset-0 size-full" iconUrl={serverImage.url} runtime={props.connection.runtime} fallbackLabel={nick.slice(0, 2).toUpperCase()} /> : nick.slice(0, 2).toUpperCase()}</span>
      <span className="w-full truncate text-[11px] font-medium">{nick}</span>
      {activity.hasUnread ? <span className="absolute right-1 top-0 size-2.5 rounded-full bg-primary" aria-hidden /> : null}
    </button>
  );
}

const resolveActiveConnection = (
  connections: readonly SidebarConnectionView[],
) =>
  connections.find((connection) =>
    connection.selectedServer
    || connection.childBuffers.some((child) => child.selected)
    || connection.pendingChannels.some((pending) => pending.selected),
  ) ?? connections[0] ?? null;

const resolveConnectionActivity = (connection: SidebarConnectionView) => {
  const activities = [
    resolveBufferActivityState(connection.serverBuffer),
    ...connection.childBuffers.map(({ buffer }) => resolveBufferActivityState(buffer)),
  ];
  return {
    hasUnread: activities.some((activity) => activity.hasUnread),
    priority: activities.some((activity) => activity.priority),
  };
};

function CopyServerImageUrlButton(props: { url: string }) {
  const [copied, setCopied] = useState(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    },
    [],
  );

  const copyImageUrl = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      feedbackTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        feedbackTimeoutRef.current = null;
      }, 1000);
    } catch {
      // Keep the resting state when clipboard access is unavailable.
    }
  };

  return (
    <button
      type="button"
      className={cn(
        'flex size-7 items-center justify-center rounded-md backdrop-blur-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary',
        copied
          ? 'bg-emerald-950/70 text-emerald-300'
          : 'bg-black/45 text-white/80 hover:bg-black/65 hover:text-white',
      )}
      onClick={() => void copyImageUrl()}
      aria-label={copied ? 'Server image URL copied' : 'Copy server image URL'}
      title={copied ? 'Copied' : 'Copy image URL'}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
