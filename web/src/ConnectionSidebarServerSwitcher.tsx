import { useMemo } from 'react';
import { PowerOff, RefreshCcw, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { resolveBufferActivityState } from './transcript/unread-state.js';
import { ConnectionSidebarFriends } from './ConnectionSidebarFriends.js';
import { ConnectionSidebarNetworkSection } from './ConnectionSidebarNetworkSection.js';
import { ConnectionSidebarServerIcon } from './ConnectionSidebarServerIcon.js';
import { NetworkServerImageFallbackCue } from './NetworkServerImageFallbackCue.js';
import { networkImageRuntimeClass } from './network-image-state.js';
import { isNetworkServerImageFallback, resolveNetworkServerImage } from './network-server-image.js';
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
    <section className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-white/8 bg-black/14 px-2 py-2">
        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-1.5">
            {props.connections.map((connection) => (
              <ServerSwitcherButton
                key={connection.network.id}
                connection={connection}
                active={connection.network.id === activeConnection?.network.id}
                externalAvatarsEnabled={props.externalAvatarsEnabled}
                showMedia={props.showMedia}
                onSelect={() => props.onSelectNetwork(connection.network)}
              />
            ))}
          </div>
        </ScrollArea>
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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 py-1.5">
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!w-full">
        <div className="min-w-0 pr-0.5">
          {props.connections.length === 0 ? (
            <div className="rounded-md bg-black/10 px-2 py-1.5 text-[12px] text-muted-foreground ring-1 ring-white/5">
              No open connections. Use Network Manager to connect.
            </div>
          ) : null}
          {activeConnection ? (
            <>
              <ServerSwitcherBanner
                connection={activeConnection}
                externalAvatarsEnabled={props.externalAvatarsEnabled}
                showMedia={props.showMedia}
              />
              <ServerSwitcherActionBar
                connection={activeConnection}
                onReconnectNetwork={props.onReconnectNetwork}
                onDisconnectNetwork={props.onDisconnectNetwork}
                onCloseConnection={props.onCloseConnection}
              />
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
            </>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}

function ServerSwitcherActionBar(props: {
  connection: SidebarConnectionView;
  onReconnectNetwork: ConnectionSidebarProps['onReconnectNetwork'];
  onDisconnectNetwork: ConnectionSidebarProps['onDisconnectNetwork'];
  onCloseConnection: ConnectionSidebarProps['onCloseConnection'];
}) {
  const phase = props.connection.runtime?.phase ?? 'offline';
  const actionLabel =
    phase === 'connected'
      ? 'Disconnect'
      : phase === 'connecting'
        ? 'Connecting'
        : 'Connect';
  return (
    <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
      <button
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-[11px] font-medium text-muted-foreground/90 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/45 disabled:pointer-events-none disabled:opacity-50"
        onClick={() =>
          phase === 'connected'
            ? props.onDisconnectNetwork(props.connection.network.id)
            : props.onReconnectNetwork(props.connection.network)
        }
        aria-label={`${actionLabel} ${props.connection.label}`}
        disabled={phase === 'connecting'}
      >
        {phase === 'connected' ? (
          <PowerOff className="size-3" />
        ) : (
          <RefreshCcw className="size-3" />
        )}
        <span>{actionLabel}</span>
      </button>
      <button
        className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/45"
        onClick={() => props.onCloseConnection(props.connection.network)}
        aria-label={`Close ${props.connection.label}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ServerSwitcherBanner(props: {
  connection: SidebarConnectionView;
  externalAvatarsEnabled?: boolean;
  showMedia?: ConnectionSidebarProps['showMedia'];
}) {
  if (props.showMedia === false) {
    return null;
  }
  const serverImage = resolveNetworkServerImage(
    props.connection.network,
    props.externalAvatarsEnabled === true,
  );
  if (!serverImage) {
    return null;
  }
  return (
    <div className="relative mb-2 overflow-hidden rounded-sm border border-white/10 bg-black/20">
      <img
        src={serverImage.url}
        alt=""
        className={cn(
          'block h-auto w-full object-contain',
          networkImageRuntimeClass(props.connection.runtime),
        )}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      {isNetworkServerImageFallback(serverImage) ? (
        <NetworkServerImageFallbackCue className="right-1 top-1 size-5" />
      ) : null}
    </div>
  );
}

function ServerSwitcherButton(props: {
  active: boolean;
  connection: SidebarConnectionView;
  externalAvatarsEnabled?: boolean;
  showMedia?: ConnectionSidebarProps['showMedia'];
  onSelect: () => void;
}) {
  const activity = resolveConnectionActivity(props.connection);
  const serverImage = props.showMedia === false
    ? null
    : resolveNetworkServerImage(
        props.connection.network,
        props.externalAvatarsEnabled === true,
      );
  return (
    <div className="relative flex w-full justify-center">
      <button
        type="button"
        className={cn(
          'relative flex size-10 items-center justify-center overflow-hidden border transition-all',
          props.active
            ? 'rounded-xl border-2 border-primary/70 bg-white/[0.12] text-foreground shadow-[0_7px_18px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.14)]'
            : 'rounded-md border-white/8 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.06]',
          props.connection.runtime?.phase !== 'connected' && 'opacity-70',
        )}
        onClick={props.onSelect}
        aria-label={
          activity.hasUnread
            ? `Open ${props.connection.labelParts.name} (unread)`
            : `Open ${props.connection.labelParts.name}`
        }
        title={props.connection.labelParts.name}
      >
        <ConnectionSidebarServerIcon
          className={serverImage ? 'size-full rounded-[inherit]' : 'size-4'}
          iconUrl={serverImage?.url}
          runtime={props.connection.runtime}
        />
        {isNetworkServerImageFallback(serverImage) ? (
          <NetworkServerImageFallbackCue />
        ) : null}
        {props.active ? (
          <span aria-hidden className="absolute inset-0 bg-white/[0.06]" />
        ) : null}
        {activity.hasUnread ? (
          <span
            aria-hidden
            className={cn(
              'absolute bottom-0.5 right-0.5 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
              activity.priority
                ? 'size-2.5 bg-primary ring-2 ring-black/45'
                : 'size-2 bg-primary',
            )}
          />
        ) : null}
      </button>
    </div>
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
