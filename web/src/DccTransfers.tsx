import { useId, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Paperclip, X } from 'lucide-react';
import type { DccSendRequest, DccTransfer } from '../../shared/dcc.js';
import { nordVpnHost } from '../../shared/nordvpn.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';
import { useAppSelector } from './app-store.js';
import { requestJson } from './api-request.js';

const statusLabels: Record<DccTransfer['status'], string> = {
  offered: 'Offered', choosing: 'Choosing a destination', waiting: 'Waiting for the recipient',
  connecting: 'Connecting', transferring: 'Transferring', completed: 'Completed',
  declined: 'Declined', cancelled: 'Cancelled', failed: 'Failed',
};

const cancellable = new Set<DccTransfer['status']>(['choosing', 'waiting', 'connecting', 'transferring']);
const routeWarning = 'DCC transfers are unencrypted and share your IP address with the other person.';

function useDccRequest() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (path: string, body?: DccSendRequest) => {
    setPending(true);
    setError(null);
    try {
      await requestJson(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The file transfer request failed.');
      return false;
    } finally {
      setPending(false);
    }
  };
  return { pending, error, submit, clearError: () => setError(null) };
}

export function DccSendButton({ bufferId, peer }: { bufferId: string; peer: string }) {
  const [open, setOpen] = useState(false);
  const request = useDccRequest();
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const address = String(data.get('address') ?? '').trim();
    const port = String(data.get('port') ?? '');
    if (await request.submit('/api/dcc/send', { bufferId, advertisedAddress: address || undefined, port: port ? Number(port) : undefined })) {
      setOpen(false);
    }
  };

  return <Dialog open={open} onOpenChange={value => {
    if (request.pending) return;
    request.clearError();
    setOpen(value);
  }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="icon" className="border-white/20 hover:border-white/30"
        aria-label="Send file" title="Send file"><Paperclip /></Button>
    </DialogTrigger>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Send file to {peer}</DialogTitle>
        <DialogDescription>{routeWarning} Track your send in File transfers.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => void onSubmit(event)}>
        <details className="rounded-md border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer">Manual router setup</summary>
          <p className="my-2 text-muted-foreground">For a peer outside your network, enter your public IP and a port forwarded to this PC.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span>Advertised IP</span><Input name="address" maxLength={64} placeholder="Automatic" spellCheck={false} /></label>
            <label className="space-y-1"><span>Port</span><Input name="port" type="number" min={1} max={65535} placeholder="Automatic" /></label>
          </div>
        </details>
        {request.error && <p role="alert" className="text-sm text-destructive">{request.error}</p>}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={request.pending}>Cancel</Button></DialogClose>
          <Button type="submit" disabled={request.pending}>{request.pending ? 'Waiting for file dialog…' : 'Choose file'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

export function DccUnavailableButton({ location }: { location?: string }) {
  const description = useId();
  const route = location && nordVpnHost(location) ? 'proxy' : 'VPN';
  return <div className="group relative shrink-0">
    <Button type="button" variant="outline" size="icon" aria-label="Send file"
      aria-disabled="true" aria-describedby={description}
      className="cursor-not-allowed border-white/20 bg-transparent text-muted-foreground/65 hover:border-white/20 hover:bg-transparent hover:text-muted-foreground/65">
      <Paperclip />
    </Button>
    <span id={description} role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-60 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
      File sending is unavailable on this {route} connection.
    </span>
  </div>;
}

export function DccSendStatus({ bufferId, onOpenTransfers }: { bufferId: string; onOpenTransfers: () => void }) {
  const transfer = useAppSelector(state => state.domain.dcc?.transfers.find(
    item => item.direction === 'send' && item.bufferId === bufferId,
  ));
  return <div className={transfer ? 'flex shrink-0 items-center gap-3 border-t border-border px-5 py-2 text-xs' : undefined}>
    <div role="status" className="min-w-0 flex-1">
      {transfer && <p className="flex items-center gap-2">
        <span className="truncate font-medium" title={transfer.filename}>{transfer.filename}</span>
        <span className={transfer.status === 'failed' ? 'shrink-0 text-destructive' : 'shrink-0 text-muted-foreground'}>
          {statusLabels[transfer.status]}
        </span>
      </p>}
    </div>
    {transfer && <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={onOpenTransfers}>
      View file transfers
    </Button>}
  </div>;
}

export function DccTransfersButton({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const dcc = useAppSelector(state => state.domain.dcc);
  const connected = useAppSelector(state => state.domain.gatewayStatus === 'connected');
  if (!dcc?.enabled) return null;
  const offers = dcc.transfers.filter(transfer => transfer.status === 'offered').length;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild>
      <Button variant="ghost" className="h-10" aria-label={offers ? `File transfers, ${offers} new ${offers === 1 ? 'offer' : 'offers'}` : 'File transfers'} title="File transfers">
        <ArrowDownToLine />
        {offers > 0 && <span className="rounded bg-primary/15 px-1.5 text-xs text-primary">{offers}</span>}
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-xl">
      <DialogHeader className="pr-8">
        <DialogTitle>File transfers</DialogTitle>
        <DialogDescription>{routeWarning}</DialogDescription>
      </DialogHeader>
      <DialogClose asChild>
        <Button variant="ghost" size="icon" className="absolute right-3 top-3" aria-label="Close file transfers"><X /></Button>
      </DialogClose>
      {dcc.transfers.length === 0
        ? <p className="py-3 text-sm text-muted-foreground">No file transfers yet.</p>
        : <ul className="max-h-[60vh] space-y-2 overflow-y-auto" aria-label="Transfers">
            {dcc.transfers.map(transfer => <DccTransferRow key={transfer.id} transfer={transfer} connected={connected} />)}
          </ul>}
    </DialogContent>
  </Dialog>;
}

function DccTransferRow({ transfer, connected }: { transfer: DccTransfer; connected: boolean }) {
  const request = useDccRequest();
  const action = (verb: 'accept' | 'decline' | 'cancel') =>
    void request.submit(`/api/dcc/${encodeURIComponent(transfer.id)}/${verb}`);
  const incoming = transfer.direction === 'receive';
  const address = transfer.address.includes(':') ? `[${transfer.address}]` : transfer.address;
  const endpoint = transfer.port > 0 ? `${address}:${transfer.port}` : address;
  return <li className="space-y-2 rounded-lg border border-border p-3">
    <div className="flex items-start gap-3">
      {incoming ? <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ArrowUpFromLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium">{transfer.filename}</p>
        <p className="break-words text-xs text-muted-foreground">
          {incoming ? 'From' : 'To'} {transfer.peer} on {transfer.networkName} · {formatBytes(transfer.size)} · {endpoint}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{statusLabels[transfer.status]}</span>
    </div>
    {transfer.status === 'transferring' && <progress aria-label={`Progress for ${transfer.filename}`} className="block h-1.5 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary" value={transfer.bytes} max={transfer.size || 1} />}
    {(request.error || transfer.error) && <p role="alert" className="text-xs text-destructive">{request.error ?? transfer.error}</p>}
    {transfer.status === 'offered' && <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" disabled={!connected || request.pending} onClick={() => action('decline')}>Decline</Button>
      <Button size="sm" disabled={!connected || request.pending} onClick={() => action('accept')}>
        {transfer.error ? 'Choose another name' : 'Accept'}
      </Button>
    </div>}
    {cancellable.has(transfer.status) && <div className="flex justify-end">
      <Button size="sm" variant="outline" disabled={!connected || request.pending} onClick={() => action('cancel')}>Cancel transfer</Button>
    </div>}
  </li>;
}

function formatBytes(bytes: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  const index = bytes < 1024 ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / 1024 ** index)} ${units[index]}`;
}
