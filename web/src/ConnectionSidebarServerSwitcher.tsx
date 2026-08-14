import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Plug, Unplug, X } from 'lucide-react';
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
      <div className="flex w-[64px] shrink-0 flex-col items-center gap-2 border-r border-[#292d33] bg-[#0d0f12] px-2 py-4">
        {props.railBrand ? (
          <div className="mb-3 flex h-8 w-full items-center justify-center overflow-hidden">
            {props.railBrand}
          </div>
        ) : null}
        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-2">
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
        {props.railPalette || props.railMediaToggle || props.railTools ? (
          <div className="flex flex-col items-center gap-2">
            {props.railPalette ? (
              <div className="relative flex h-8 w-full items-center justify-center">
                {props.railPalette}
              </div>
            ) : null}
            {props.railMediaToggle ? (
              <div className="relative flex h-8 w-full items-center justify-center">
                {props.railMediaToggle}
              </div>
            ) : null}
            {props.railTools ? (
              <div className="relative flex h-8 w-full items-center justify-center">
                {props.railTools}
              </div>
            ) : null}
          </div>
        ) : null}
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
  const serverImage = props.showMedia === false
    ? null
    : resolveNetworkServerImage(
        props.connection.network,
        props.externalAvatarsEnabled === true,
      );
  const actionLabel =
    phase === 'connected'
      ? 'Disconnect'
      : phase === 'connecting'
        ? 'Connecting'
        : 'Connect';
  return (
    <header
      className={cn(
        'relative mb-5 flex overflow-hidden bg-[#111419]',
        serverImage ? 'min-h-[116px]' : 'min-h-[82px] border border-[#292d33]',
      )}
    >
      {serverImage ? (
        <img
          src={serverImage.url}
          alt=""
          className={cn(
            'absolute inset-0 size-full object-cover',
            networkImageRuntimeClass(props.connection.runtime),
          )}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : null}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0',
          serverImage
            ? 'bg-[linear-gradient(180deg,rgba(5,7,10,0.48)_0%,rgba(5,7,10,0.18)_42%,rgba(5,7,10,0.82)_100%)]'
            : 'bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent)]',
        )}
      />
      {serverImage ? (
        <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1.5">
          {isNetworkServerImageFallback(serverImage) ? (
            <NetworkServerImageFallbackCue className="static size-5" />
          ) : null}
          <CopyServerImageUrlButton url={serverImage.url} />
        </div>
      ) : null}
      <div className="pointer-events-none relative z-20 flex w-full flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-0.5">
            <button
              type="button"
              className="pointer-events-auto block max-w-full truncate rounded-sm text-left text-[15px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              onClick={() => props.onSelectNetwork(props.connection.network)}
              aria-label={`Open ${props.connection.labelParts.name}`}
              title="Open server"
            >
              {props.connection.labelParts.name}
            </button>
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <button
              className="flex size-8 items-center justify-center rounded-md bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
              onClick={() =>
                phase === 'connected'
                  ? props.onDisconnectNetwork(props.connection.network.id)
                  : props.onReconnectNetwork(props.connection.network)
              }
              aria-label={`${actionLabel} ${props.connection.labelParts.name}`}
              title={actionLabel}
              disabled={phase === 'connecting'}
            >
              {phase === 'connected' ? (
                <Unplug className="size-4" />
              ) : (
                <Plug className={cn('size-4', phase === 'connecting' && 'animate-pulse')} />
              )}
            </button>
            <button
              className="flex size-8 items-center justify-center rounded-md bg-black/35 text-white/85 backdrop-blur-sm transition-colors hover:bg-black/55 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              onClick={() => props.onCloseConnection(props.connection.network)}
              aria-label={`Close ${props.connection.labelParts.name}`}
              title="Close server"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-white/75 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              phase === 'connected'
                ? 'bg-[#8cc9b7]'
                : phase === 'connecting'
                  ? 'bg-[#e0bc68]'
                  : 'bg-[#66707c]',
            )}
          />
          <span>{connectionStatusLabel(phase)}</span>
        </div>
      </div>
    </header>
  );
}

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

const connectionStatusLabel = (phase: 'connected' | 'connecting' | 'offline') => {
  if (phase === 'connected') return 'Connected';
  if (phase === 'connecting') return 'Connecting';
  return 'Offline';
};

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
          'relative flex size-10 items-center justify-center overflow-hidden rounded-sm p-0 transition-colors',
          props.active
            ? 'bg-[#25282e] text-foreground'
            : 'bg-white/[0.035] hover:bg-white/[0.07]',
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
          className={serverImage ? 'absolute inset-0 size-full rounded-[inherit]' : 'size-4'}
          iconUrl={serverImage?.url}
          runtime={props.connection.runtime}
        />
        {isNetworkServerImageFallback(serverImage) ? (
          <NetworkServerImageFallbackCue />
        ) : null}
        {props.active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_#f27f68]"
          />
        ) : null}
        {activity.hasUnread ? (
          <span
            aria-hidden
            className={cn(
              'absolute bottom-0.5 right-0.5 z-20 rounded-full shadow-[0_0_0_2px_rgba(8,8,10,0.95)]',
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
