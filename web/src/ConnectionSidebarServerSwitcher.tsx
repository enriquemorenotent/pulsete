import { useMemo } from 'react';
import { ConnectionSidebarServerIcon } from './ConnectionSidebarServerIcon.js';
import { resolveNetworkServerImage } from './network-server-image.js';
import { Plug, Unplug } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './transcript/unread-state.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import { ConnectionSidebarAccountMenu } from './ConnectionSidebarAccountMenu.js';
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
      <div className="shrink-0 border-b border-white/5 px-3 pb-2 pt-3">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground/75">Accounts</h2>
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
        <div className="min-w-0 px-2.5 pb-2 pt-1">
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
  const statusLabel = phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting' : 'Offline';
  return (
    <header className="flex shrink-0 items-center gap-2 px-4 py-3">
      <button
        type="button"
        className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/45"
        onClick={() => props.onSelectNetwork(props.connection.network)}
        aria-label={`Open ${props.connection.labelParts.name}`}
        aria-description={`${statusLabel} as ${props.connection.labelParts.nick}`}
        title="Open server"
      >
        <span className="block truncate text-[13px] font-semibold text-foreground/90">{props.connection.labelParts.name}</span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className={cn('flex size-7 items-center justify-center rounded-md outline-none hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-primary/45 disabled:cursor-wait', phase === 'connected' ? 'text-muted-foreground hover:text-foreground' : phase === 'connecting' ? 'text-amber-300' : 'text-primary hover:text-primary/80')}
          onClick={() => phase === 'connected' ? props.onDisconnectNetwork(props.connection.network.id) : props.onReconnectNetwork(props.connection.network)}
          aria-label={`${actionLabel} ${props.connection.labelParts.name}`}
          title={actionLabel}
          disabled={phase === 'connecting'}
        >
          {phase === 'connected' ? <Unplug className="size-3.5" /> : <Plug className="size-3.5" />}
        </button>
        <ConnectionSidebarAccountMenu
          key={props.connection.network.id}
          name={props.connection.labelParts.name}
          imageUrl={serverImage?.url}
          onClose={() => props.onCloseConnection(props.connection.network)}
        />
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
  const phase = props.connection.runtime?.phase ?? 'offline';
  const statusLabel = phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting' : 'Offline';
  const serverImage = props.showMedia === false ? null : resolveNetworkServerImage(props.connection.network, props.externalAvatarsEnabled === true);
  return (
    <button type="button" className={cn('relative flex min-w-12 flex-1 flex-col items-center gap-2 rounded-lg py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary', props.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground')} onClick={props.onSelect} aria-label={`Open ${props.connection.labelParts.name}${activity.hasUnread ? ' (unread)' : ''}`} aria-description={statusLabel} title={`${props.connection.labelParts.name} · ${nick} · ${statusLabel}`} aria-pressed={props.active}>
      <span aria-hidden className={cn('relative flex size-10 items-center justify-center overflow-hidden rounded-lg border text-sm font-semibold', props.active ? 'border-primary/60 bg-primary/20 text-primary' : 'border-border bg-secondary text-foreground')}>
        {serverImage ? <ConnectionSidebarServerIcon className="absolute inset-0 size-full" iconUrl={serverImage.url} runtime={props.connection.runtime} fallbackLabel={nick.slice(0, 2).toUpperCase()} /> : nick.slice(0, 2).toUpperCase()}
        <span className={cn('absolute bottom-1 right-1 size-1.5 rounded-full ring-2 ring-background', phase === 'connected' ? 'bg-emerald-300' : phase === 'connecting' ? 'bg-amber-300' : 'bg-slate-500')} />
      </span>
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
