import { Copy, Heart, PencilLine, Server, Trash2 } from 'lucide-react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
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
  runtime: NetworkRuntimeState | null;
  onSelect: (networkId: string) => void;
}) {
  const rowStatus = getNetworkManagerRowStatus(props.runtime);
  const serverImage = resolveNetworkServerImage(
    props.network,
    props.externalAvatarsEnabled === true,
  );

  return (
    <button
      className={cn(
        'group block w-full rounded-[1rem] px-4 py-3.5 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50',
        props.selected
          ? 'bg-white/[0.06] ring-1 ring-inset ring-primary/30 shadow-[0_10px_28px_rgba(0,0,0,0.18)]'
          : 'hover:bg-white/[0.03]',
      )}
      onClick={() => props.onSelect(props.network.id)}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.05] text-muted-foreground">
          <ConnectionSidebarServerIcon
            className={serverImage ? 'size-full rounded-[inherit]' : 'size-3.5'}
            iconUrl={serverImage?.url}
            runtime={props.runtime}
          />
          {isNetworkServerImageFallback(serverImage) ? (
            <NetworkServerImageFallbackCue />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-medium text-foreground">{props.network.name}</span>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]', statusPillClassName(rowStatus))}>
              <span className={cn('size-1.5 rounded-full', statusDotClassName(rowStatus))} />
              {statusPillLabel(rowStatus)}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {props.network.host}:{props.network.port}
          </p>
        </div>
        {props.network.favorite ? <Heart className="size-3.5 fill-current text-rose-300" /> : null}
      </div>
    </button>
  );
}

export function SelectedNetworkPane(props: {
  externalAvatarsEnabled?: boolean;
  network: NetworkProfile;
  runtime: NetworkRuntimeState | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  onRemove: () => void;
}) {
  const status = getNetworkManagerRowStatus(props.runtime);
  const serverImage = resolveNetworkServerImage(
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
              {status === 'online' ? <Badge variant="success">Online</Badge> : null}
              {status === 'connecting' ? <Badge variant="outline">Connecting</Badge> : null}
              {props.network.favorite ? <Heart className="size-3.5 fill-current text-rose-300" /> : null}
            </div>
          </div>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {props.network.host}:{props.network.port} · {props.network.tls ? 'SSL/TLS' : 'TCP'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={props.onEdit} className="justify-start">
          <PencilLine />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={props.onDuplicate} className="justify-start">
          <Copy />
          Duplicate
        </Button>
        <Button variant="outline" size="sm" onClick={props.onFavorite} className="justify-start">
          <Heart className={cn(props.network.favorite ? 'fill-current text-rose-300' : '')} />
          {props.network.favorite ? 'Unfavorite' : 'Favorite'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.onRemove}
          className="justify-start border-destructive/25 text-destructive hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          Remove
        </Button>
      </div>

      <dl className="space-y-3 rounded-[1rem] bg-white/[0.03] p-4 text-[13px] ring-1 ring-white/[0.05]">
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
    <div className="space-y-1">
      <dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{props.label}</dt>
      <dd className="font-medium text-foreground">{props.value}</dd>
    </div>
  );
}

const statusPillLabel = (status: ReturnType<typeof getNetworkManagerRowStatus>) => {
  if (status === 'online') {
    return 'Online';
  }
  if (status === 'connecting') {
    return 'Connecting';
  }
  return 'Offline';
};

const statusPillClassName = (status: ReturnType<typeof getNetworkManagerRowStatus>) => {
  if (status === 'online') {
    return 'bg-emerald-500/10 text-emerald-300';
  }
  if (status === 'connecting') {
    return 'bg-amber-400/10 text-amber-200';
  }
  return 'bg-white/[0.05] text-muted-foreground';
};

const statusDotClassName = (status: ReturnType<typeof getNetworkManagerRowStatus>) => {
  if (status === 'online') {
    return 'bg-emerald-400';
  }
  if (status === 'connecting') {
    return 'bg-amber-300';
  }
  return 'bg-zinc-500';
};
