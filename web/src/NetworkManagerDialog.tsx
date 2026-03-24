import { Plus, Power, Server } from 'lucide-react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { getNetworkManagerConnectButtonState } from './network-manager-dialog-model.js';
import {
  EmptySelectionPane,
  NetworkManagerListRow,
  SelectedNetworkPane,
} from './network-manager-dialog-sections.js';

type NetworkManagerDialogProps = {
  networks: NetworkProfile[];
  selected: NetworkProfile | null;
  runtime: NetworkRuntimeState | null;
  runtimes: Record<string, NetworkRuntimeState | null>;
  showFavoritesOnly: boolean;
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
  const connectButton = getNetworkManagerConnectButtonState(props.selected, props.runtime);

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="h-[min(90dvh,42rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),66rem)]"
      >
        <div className="grid h-full min-h-0 gap-0 bg-card lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 border-b border-border px-4 py-4">
              <DialogHeader className="space-y-1">
                <DialogTitle>Network Manager</DialogTitle>
                <DialogDescription>Saved networks and live connection state.</DialogDescription>
              </DialogHeader>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/20 hover:text-foreground">
                  <Checkbox checked={props.showFavoritesOnly} onCheckedChange={props.onToggleFavorites} />
                  <span>Favorites only</span>
                </label>
                <Button variant="secondary" size="sm" onClick={props.onAdd} className="ml-auto">
                  <Plus />
                  Add Network
                </Button>
              </div>
            </div>

            <ScrollArea className="min-h-0 h-full flex-1">
              <div className="space-y-2 px-3 py-3">
                {props.networks.length === 0 ? (
                  <div className="px-2 py-12 text-center">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground">
                      <Server className="size-4" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">No networks configured.</p>
                  </div>
                ) : null}

                {props.networks.map((network) => (
                  <NetworkManagerListRow
                    key={network.id}
                    network={network}
                    selected={props.selected?.id === network.id}
                    runtime={props.runtimes[network.id] ?? null}
                    onSelect={props.onSelect}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden border-t border-border bg-secondary/25 lg:border-l lg:border-t-0">
            <ScrollArea className="min-h-0 h-full flex-1">
              {props.selected ? (
                <SelectedNetworkPane
                  network={props.selected}
                  runtime={props.runtime}
                  onEdit={props.onEdit}
                  onDuplicate={props.onDuplicate}
                  onFavorite={props.onFavorite}
                  onRemove={props.onRemove}
                />
              ) : (
                <EmptySelectionPane />
              )}
            </ScrollArea>

            <div className="shrink-0 border-t border-border px-4 py-3">
              <DialogFooter className="gap-2 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={props.onClose}>
                  Close
                </Button>
                <Button variant="secondary" onClick={props.onConnect} disabled={connectButton.disabled}>
                  <Power />
                  {connectButton.label}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
