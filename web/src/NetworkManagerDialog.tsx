import { useState } from 'react';
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
  onRemove: (network: NetworkProfile) => void;
  onConnect: () => void;
  onFavorite: () => void;
};

export function NetworkManagerDialog(props: NetworkManagerDialogProps) {
  const [removeCandidate, setRemoveCandidate] = useState<NetworkProfile | null>(null);
  const connectButton = getNetworkManagerConnectButtonState(props.selected, props.runtime);
  const confirmRemove = () => {
    if (!removeCandidate) {
      return;
    }
    props.onRemove(removeCandidate);
    setRemoveCandidate(null);
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && props.onClose()}>
        <DialogContent
          aria-describedby={undefined}
          className="h-[min(90dvh,44rem)] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:w-[min(calc(100vw-1rem),70rem)]"
        >
          <div className="grid h-full min-h-0 gap-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 border-b border-white/6 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <DialogHeader className="space-y-1">
                    <DialogTitle>Network Manager</DialogTitle>
                    <DialogDescription>Saved networks and live connection state.</DialogDescription>
                  </DialogHeader>
                  <span className="rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                    {props.networks.length} saved
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-white/16 hover:text-foreground">
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
                <div className="space-y-1 px-3 py-3">
                  {props.networks.length === 0 ? (
                    <div className="px-2 py-12 text-center">
                      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground">
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

            <div className="flex min-h-0 flex-col overflow-hidden border-t border-white/6 bg-black/18 lg:border-l lg:border-t-0">
              <ScrollArea className="min-h-0 h-full flex-1">
                {props.selected ? (
                  <SelectedNetworkPane
                    network={props.selected}
                    runtime={props.runtime}
                    onEdit={props.onEdit}
                    onDuplicate={props.onDuplicate}
                    onFavorite={props.onFavorite}
                    onRemove={() => setRemoveCandidate(props.selected)}
                  />
                ) : (
                  <EmptySelectionPane />
                )}
              </ScrollArea>

              <div className="shrink-0 border-t border-white/6 px-4 py-3">
                <DialogFooter className="gap-2 sm:flex-row sm:justify-between">
                  <Button variant="outline" onClick={props.onClose}>
                    Close
                  </Button>
                  <Button onClick={props.onConnect} disabled={connectButton.disabled}>
                    <Power />
                    {connectButton.label}
                  </Button>
                </DialogFooter>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeCandidate)} onOpenChange={(open) => !open && setRemoveCandidate(null)}>
        <DialogContent className="sm:w-[min(calc(100vw-1rem),28rem)]">
          <DialogHeader>
            <DialogTitle>Remove network?</DialogTitle>
            <DialogDescription>
              {removeCandidate
                ? `This removes ${removeCandidate.name} and its associated logs.`
                : 'This removes the saved network and its associated logs.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveCandidate(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove network
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
