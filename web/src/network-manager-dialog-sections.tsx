import { Copy, Heart, PencilLine, Server, Trash2 } from 'lucide-react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import {
  getNetworkManagerAuthLabel,
  getNetworkManagerAutoJoinLabel,
  getNetworkManagerRowStatus,
  getNetworkManagerStatusLabel,
} from './network-manager-dialog-model.js';

export function NetworkManagerListRow(props: {
  network: NetworkProfile;
  selected: boolean;
  runtime: NetworkRuntimeState | null;
  onSelect: (networkId: string) => void;
}) {
  const rowStatus = getNetworkManagerRowStatus(props.runtime);

  return (
    <button
      className={cn(
        'group block w-full rounded-lg border px-3 py-3 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring/50',
        props.selected
          ? 'border-primary/35 bg-accent'
          : 'border-border/80 bg-card/70 hover:border-primary/20 hover:bg-accent/55',
      )}
      onClick={() => props.onSelect(props.network.id)}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <Server className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-medium text-foreground">{props.network.name}</span>
            {rowStatus === 'online' ? <Badge variant="success">Online</Badge> : null}
            {rowStatus === 'connecting' ? <Badge variant="outline">Connecting</Badge> : null}
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
  network: NetworkProfile;
  runtime: NetworkRuntimeState | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  onRemove: () => void;
}) {
  const status = getNetworkManagerRowStatus(props.runtime);

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {props.network.name}
          </h3>
          {status === 'online' ? <Badge variant="success">Online</Badge> : null}
          {status === 'connecting' ? <Badge variant="outline">Connecting</Badge> : null}
          {props.network.favorite ? <Heart className="size-3.5 fill-current text-rose-300" /> : null}
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

      <dl className="space-y-3 border-t border-border pt-4 text-[13px]">
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
      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground">
        <Server className="size-4" />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">Select a network</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Connection details and actions appear here.</p>
    </div>
  );
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="text-right font-medium text-foreground">{props.value}</dd>
    </div>
  );
}
