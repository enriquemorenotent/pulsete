import { Heart, Server } from 'lucide-react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';
import { ConnectionRouteBadge } from './ConnectionRouteBadge.js';
import { NetworkManagerActions } from './NetworkManagerActions.js';
import { cn } from '@/lib/utils.js';
import { ConnectionSidebarServerIcon } from './ConnectionSidebarServerIcon.js';
import { NetworkServerImageFallbackCue } from './NetworkServerImageFallbackCue.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerRowStatus,
  getNetworkManagerStatusLabel,
} from './network-manager-dialog-model.js';
import {
  isNetworkServerImageFallback,
  resolveNetworkServerImage,
} from './network-server-image.js';

export function NetworkManagerListRow(props: {
  externalAvatarsEnabled?: boolean;
  network: NetworkProfile;
  selected: boolean;
  serverImagesVisible?: boolean;
  runtime: NetworkRuntimeState | null;
  onSelect: (networkId: string) => void;
}) {
  const rowStatus = getNetworkManagerRowStatus(props.runtime);
  const serverImage = props.serverImagesVisible === false
    ? null
    : resolveNetworkServerImage(
        props.network,
        props.externalAvatarsEnabled === true,
      );

  return (
    <button
      className={cn(
        'group flex w-full min-w-0 items-stretch rounded-lg p-0 text-left ring-1 ring-inset ring-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary',
        props.selected
          ? 'bg-primary/10'
          : 'hover:bg-white/[0.03]',
      )}
      aria-pressed={props.selected}
      aria-description={getNetworkManagerStatusLabel(props.runtime)}
      onClick={() => props.onSelect(props.network.id)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 pr-3">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.05] text-muted-foreground">
          <ConnectionSidebarServerIcon
            className={serverImage ? 'size-full rounded-[inherit]' : 'size-3.5'}
            networkId={props.network.id}
            iconUrl={serverImage?.url}
            runtime={props.runtime}
          />
          {isNetworkServerImageFallback(serverImage) ? (
            <NetworkServerImageFallbackCue />
          ) : null}
          <span title={getNetworkManagerStatusLabel(props.runtime)} aria-hidden className={cn("absolute bottom-1 right-1 size-2 rounded-full ring-2 ring-background", statusDotClassName(rowStatus))} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-medium text-foreground">{props.network.name}</span>

          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {props.network.host}:{props.network.port}
          </p>
        </div>
        {props.network.favorite ? <Heart className="size-3.5 fill-current text-rose-300" /> : null}
      </div>
      <ConnectionRouteBadge network={props.network} phase={props.runtime?.phase ?? 'offline'} vpnServer={props.runtime?.vpnServer} embedded />
    </button>
  );
}

export function SelectedNetworkPane(props: {
  externalAvatarsEnabled?: boolean;
  network: NetworkProfile;
  serverImagesVisible?: boolean;
  runtime: NetworkRuntimeState | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  onRemove: () => void;
}) {
  const serverImage = props.serverImagesVisible === false
    ? null
    : resolveNetworkServerImage(
        props.network,
        props.externalAvatarsEnabled === true,
      );

  return (
    <div className="space-y-6 px-5 py-5">
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Selected network</p>
        <div className="flex items-center gap-3">
          <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.05] text-muted-foreground">
            <ConnectionSidebarServerIcon
              className={serverImage ? 'size-full rounded-[inherit]' : 'size-4'}
              networkId={props.network.id}
            iconUrl={serverImage?.url}
              runtime={props.runtime}
            />
            {isNetworkServerImageFallback(serverImage) ? (
              <NetworkServerImageFallbackCue />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {props.network.name}
              </h3>
              {props.network.favorite ? <Heart className="size-3.5 fill-current text-rose-300" /> : null}
            </div>
          </div>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {props.network.host}:{props.network.port} · {props.network.tls ? 'SSL/TLS' : 'TCP'}
        </p>
      </div>

      <NetworkManagerActions name={props.network.name} favorite={props.network.favorite} onEdit={props.onEdit} onFavorite={props.onFavorite} onDuplicate={props.onDuplicate} onRemove={props.onRemove} />

      <dl className="space-y-4 border-t border-white/6 pt-4 text-[13px]">
        <DetailRow label="Status" value={getNetworkManagerStatusLabel(props.runtime)} />
        <DetailRow label="Nick" value={props.network.nick} />
        <DetailRow label="Authentication" value={getNetworkManagerAuthLabel(props.network)} />
        <DetailRow label="Autojoin" value={getNetworkManagerAutoJoinLabel(props.network)} />
      </dl>
    </div>
  );
}

export function EmptySelectionPane() {
  return (
    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground">
        <Server className="size-4" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">Select a network</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Connection details and actions appear here.</p>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{props.label}</dt>
      <dd className="break-words font-medium text-foreground">{props.value}</dd>
    </div>
  );
}

const statusDotClassName = (status: ReturnType<typeof getNetworkManagerRowStatus>) => {
  if (status === 'online') {
    return 'bg-emerald-400';
  }
  if (status === 'connecting') {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
