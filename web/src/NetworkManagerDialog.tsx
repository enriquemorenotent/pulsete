import { Copy, Heart, PencilLine, Plus, Power, Trash2 } from 'lucide-react';
import type { NetworkProfile } from '../../shared/protocol.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Separator } from '@/components/ui/separator.js';
import { cn } from '@/lib/utils.js';
import type { NetworkRuntimeState } from './workspace.js';

type NetworkManagerDialogProps = {
  networks: NetworkProfile[];
  selected: NetworkProfile | null;
  runtime: NetworkRuntimeState | null;
  showFavoritesOnly: boolean;
  hiddenManagedNetworkName: string | null;
  onSelect: (networkId: string) => void;
  onToggleFavorites: () => void;
  onClose: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onConnect: () => void;
  onFavorite: () => void;
};

export function NetworkManagerDialog(props: NetworkManagerDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="h-[min(90dvh,44rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),68rem)]"
      >
        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 space-y-3 px-4 py-3">
              <DialogHeader className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>Network Manager</DialogTitle>
                </div>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="secondary" size="sm" onClick={props.onAdd}>
                  <Plus />
                  Add
                </Button>
                <Button variant="outline" size="sm" onClick={props.onEdit} disabled={!props.selected}>
                  <PencilLine />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={props.onDuplicate} disabled={!props.selected}>
                  <Copy />
                  Duplicate
                </Button>
                <Button variant="ghost" size="sm" onClick={props.onFavorite} disabled={!props.selected}>
                  <Heart />
                  {props.selected?.favorite ? 'Unfavorite' : 'Favorite'}
                </Button>
                <Button variant="ghost" size="sm" onClick={props.onRemove} disabled={!props.selected}>
                  <Trash2 />
                  Remove
                </Button>
                <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Checkbox checked={props.showFavoritesOnly} onCheckedChange={props.onToggleFavorites} />
                  <span>Show favorites only</span>
                </label>
              </div>
              {props.hiddenManagedNetworkName ? (
                <div className="border border-primary/35 bg-primary/10 px-3 py-2 text-[13px] text-muted-foreground">
                  {props.hiddenManagedNetworkName} is hidden by the favorites filter. Clear the filter to restore that selection.
                </div>
              ) : null}
            </div>

            <Separator />

            <ScrollArea className="min-h-0 h-full flex-1">
              <div className="space-y-1 p-2">
                {props.networks.length === 0 ? (
                  <div className="border border-border bg-secondary px-3 py-2 text-[13px] text-muted-foreground">
                    No networks configured.
                  </div>
                ) : null}

                {props.networks.map((network) => {
                  const selected = props.selected?.id === network.id;
                  const online = selected && props.runtime?.connected;
                  const connecting = selected && props.runtime?.connecting;

                  return (
                    <button
                      key={network.id}
                      className={cn(
                        'block w-full border px-3 py-2 text-left text-[13px] transition-colors',
                        selected ? 'border-primary/40 bg-accent' : 'border-border bg-card hover:bg-accent'
                      )}
                      onClick={() => props.onSelect(network.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium text-foreground">{network.name}</span>
                            {online ? <Badge variant="success">Online</Badge> : null}
                            {connecting ? <Badge variant="outline">Connecting</Badge> : null}
                          </div>
                          <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                            {network.host}:{network.port} {network.tls ? 'SSL' : 'TCP'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-secondary/35 lg:border-l lg:border-t-0">
            <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  {props.selected?.name ?? 'Nothing selected'}
                </h3>
                <p className="text-[13px] text-muted-foreground">
                  {props.selected
                    ? [
                        `${props.selected.host}:${props.selected.port}`,
                        props.selected.tls ? 'SSL/TLS' : 'TCP',
                        props.runtime?.connected ? 'Connected' : props.runtime?.connecting ? 'Connecting' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Pick a network from the list.'}
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-border px-4 py-3">
              <DialogFooter className="gap-2 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={props.onClose}>
                  Close
                </Button>
                <Button variant="secondary" onClick={props.onConnect} disabled={!props.selected}>
                  <Power />
                  Connect
                </Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
