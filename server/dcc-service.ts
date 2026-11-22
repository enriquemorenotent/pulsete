import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { BufferState } from '../shared/protocol-chat.js';
import type { DccSendRequest, DccState, DccTransfer, PickDccFile } from '../shared/dcc.js';
import { badRequest, notFound, serviceUnavailable } from './app-error.js';
import { encodeDccOffer, isDccAdvertisedAddressAllowed, isDccEndpointAllowed, normalizeAddress, type DccOffer } from './dcc-protocol.js';
import { checkDccDestination, DccDestinationExistsError, listenForDccPeer, openDccSource, receiveDccFile, sendDccBytes } from './dcc-streams.js';

type Session = {
  socket: object;
  localAddress: string;
  networkName: string;
  sendOffer: (line: string) => boolean;
};
type Entry = {
  transfer: DccTransfer;
  session: Session;
  controller: AbortController;
  expire?: ReturnType<typeof setTimeout>;
  expiresAt?: number;
  lastProgress: number;
  running?: boolean;
};

const terminal = new Set<DccTransfer['status']>(['completed', 'declined', 'cancelled', 'failed']);
const maxPending = 20;
const maxRecent = 30;
const offerDurationMs = 120_000;

export class DccService {
  private readonly jobs = new Set<Promise<void>>();
  private readonly entries = new Map<string, Entry>();
  private choosing = false;
  private closed = false;

  constructor(private readonly options: {
    pick?: PickDccFile;
    session: (networkId: string) => Session | null;
    buffer: (bufferId: string) => BufferState | null | undefined;
    publish: (state: DccState) => void;
  }) {}

  snapshot(): DccState {
    return { enabled: !!this.options.pick, transfers: [...this.entries.values()].reverse().map(entry => entry.transfer) };
  }

  offer(networkId: string, peer: string, offer: DccOffer) {
    if (!this.options.pick || this.closed || this.pendingCount() >= maxPending) return;
    const session = this.options.session(networkId);
    if (!session || !isDccEndpointAllowed(offer.address, session.localAddress)) return;
    if ([...this.entries.values()].some(({ transfer }) =>
      transfer.status === 'offered' && transfer.networkId === networkId && transfer.peer === peer
      && transfer.address === offer.address && transfer.port === offer.port
      && transfer.filename === offer.filename && transfer.size === offer.size)) return;
    const entry = this.create(networkId, peer, session, 'receive', offer, 'offered');
    entry.expiresAt = Date.now() + offerDurationMs;
    this.scheduleExpiry(entry, offerDurationMs);
  }

  async send(request: DccSendRequest) {
    const buffer = this.options.buffer(request.bufferId);
    if (buffer?.kind !== 'query') throw badRequest('Choose a direct message to send a file.');
    const session = this.options.session(buffer.networkId);
    if (!session) throw badRequest('DCC requires a connected IRC account with a direct route.');
    if (this.pendingCount() >= maxPending) throw badRequest('Too many pending file transfers.');
    const advertised = request.advertisedAddress === undefined ? session.localAddress : normalizeAddress(request.advertisedAddress);
    if (!advertised || !isDccAdvertisedAddressAllowed(advertised, session.localAddress)) {
      throw badRequest('Enter a reachable IP address of the same type as your IRC connection.');
    }
    const path = await this.pick({ kind: 'send', peer: buffer.target });
    if (!path) return;
    const current = this.options.buffer(request.bufferId);
    if (current?.target !== buffer.target || current.networkId !== buffer.networkId || !this.isCurrent(buffer.networkId, session)) {
      throw badRequest('The IRC conversation changed while choosing the file.');
    }
    const source = await openDccSource(path).catch(() => {
      throw badRequest('Could not open the file. Choose a regular file under 4 GiB with a valid filename.');
    });
    if (!this.isCurrent(buffer.networkId, session) || this.pendingCount() >= maxPending) {
      await source.file.close();
      throw badRequest('The transfer is no longer available.');
    }
    const entry = this.create(buffer.networkId, buffer.target, session, 'send', {
      filename: source.filename, size: source.size, address: advertised, port: request.port ?? 0,
    }, 'waiting', buffer.id);
    this.run(entry, async signal => {
      try {
        const socket = await listenForDccPeer(session.localAddress, request.port ?? 0, signal, port => {
          this.requireCurrent(entry);
          const raw = encodeDccOffer(buffer.target, { ...entry.transfer, port });
          if (!raw || !session.sendOffer(raw)) throw new Error('Could not send the file offer over IRC.');
          this.update(entry, { port });
        });
        this.update(entry, { status: 'transferring' });
        await sendDccBytes(socket, source.file, source.size, signal, bytes => this.progress(entry, bytes));
      } finally {
        await source.file.close();
      }
    });
  }

  async accept(id: string) {
    const entry = this.requireEntry(id);
    if (entry.transfer.status !== 'offered') throw badRequest('This offer is no longer available.');
    this.requireCurrent(entry);
    this.update(entry, { status: 'choosing', error: undefined });
    let path: string | null;
    try {
      path = await this.pick({ kind: 'receive', filename: entry.transfer.filename });
      if (path && !terminal.has(entry.transfer.status)) await checkDccDestination(path);
    } catch (error) {
      if (terminal.has(entry.transfer.status)) return;
      if (error instanceof DccDestinationExistsError) {
        this.update(entry, { status: 'offered', error: error.message });
        return;
      }
      this.update(entry, { status: 'offered' });
      throw badRequest(readableTransferError(error));
    }
    if (terminal.has(entry.transfer.status)) return;
    if (!path) {
      this.update(entry, { status: 'offered' });
      return;
    }
    this.requireCurrent(entry);
    const offer = entry.transfer;
    if (!isDccEndpointAllowed(offer.address, entry.session.localAddress)) {
      this.finish(entry, 'failed', 'The offered address is no longer reachable.');
      return;
    }
    clearTimeout(entry.expire);
    this.update(entry, { status: 'connecting' });
    this.run(entry, signal => receiveDccFile(offer, path,
      isIP(offer.address) === isIP(entry.session.localAddress) ? entry.session.localAddress : undefined,
      signal, () => this.update(entry, { status: 'transferring' }), bytes => this.progress(entry, bytes)));
  }

  decline(id: string) {
    const entry = this.requireEntry(id);
    if (entry.transfer.status === 'offered') this.finish(entry, 'declined');
  }

  cancel(id: string) {
    const entry = this.requireEntry(id);
    if (!terminal.has(entry.transfer.status)) this.stop(entry);
  }

  cancelNetwork(networkId: string) {
    for (const entry of this.entries.values()) {
      if (entry.transfer.networkId === networkId && !terminal.has(entry.transfer.status)) this.stop(entry);
    }
  }

  close() {
    this.closed = true;
    for (const entry of this.entries.values()) {
      clearTimeout(entry.expire);
      entry.controller.abort();
    }
  }

  async waitForIdle() { await Promise.all(this.jobs); }

  private async pick(request: Parameters<PickDccFile>[0]) {
    if (!this.options.pick || this.closed) throw serviceUnavailable('File transfers are available in the desktop app.');
    if (this.choosing) throw badRequest('Close the current file dialog first.');
    this.choosing = true;
    try {
      return await this.options.pick(request);
    } finally {
      this.choosing = false;
    }
  }

  private create(networkId: string, peer: string, session: Session, direction: DccTransfer['direction'],
    offer: DccOffer, status: DccTransfer['status'], bufferId?: string) {
    const entry: Entry = {
      transfer: { ...offer, id: randomUUID(), networkId, networkName: session.networkName, peer, direction, status, bytes: 0, bufferId },
      session, controller: new AbortController(), lastProgress: 0,
    };
    this.entries.set(entry.transfer.id, entry);
    this.publish();
    return entry;
  }

  private run(entry: Entry, transfer: (signal: AbortSignal) => Promise<void>) {
    entry.running = true;
    const job = transfer(entry.controller.signal).then(
      () => this.finish(entry, 'completed', undefined, entry.transfer.size),
      error => {
        if (entry.controller.signal.aborted) {
          this.finish(entry, 'cancelled');
        } else if (error instanceof DccDestinationExistsError) {
          const remaining = (entry.expiresAt ?? 0) - Date.now();
          entry.running = false;
          if (remaining > 0) {
            this.scheduleExpiry(entry, remaining);
            this.update(entry, { status: 'offered', error: error.message });
          } else {
            this.finish(entry, 'failed', 'The file offer expired.');
          }
        } else {
          this.finish(entry, 'failed', readableTransferError(error));
        }
      },
    );
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job));
  }

  private scheduleExpiry(entry: Entry, delay: number) {
    entry.expire = setTimeout(() => this.finish(entry, 'failed', 'The file offer expired.'), delay);
    entry.expire.unref();
  }

  private progress(entry: Entry, bytes: number) {
    const now = Date.now();
    if (now - entry.lastProgress < 200 && bytes !== entry.transfer.size) return;
    entry.lastProgress = now;
    this.update(entry, { bytes });
  }

  private stop(entry: Entry) {
    entry.controller.abort();
    if (!entry.running) this.finish(entry, 'cancelled');
  }

  private finish(entry: Entry, status: DccTransfer['status'], error?: string, bytes = entry.transfer.bytes) {
    clearTimeout(entry.expire);
    this.update(entry, { status, error, bytes });
  }

  private update(entry: Entry, fields: Partial<DccTransfer>) {
    entry.transfer = { ...entry.transfer, ...fields };
    this.publish();
  }

  private publish() {
    const finished = [...this.entries.values()].filter(entry => terminal.has(entry.transfer.status));
    for (const entry of finished.slice(0, Math.max(0, finished.length - maxRecent))) {
      this.entries.delete(entry.transfer.id);
    }
    if (!this.closed) this.options.publish(this.snapshot());
  }

  private pendingCount() {
    return [...this.entries.values()].filter(entry => !terminal.has(entry.transfer.status)).length;
  }

  private requireEntry(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw notFound('File transfer not found.');
    return entry;
  }

  private isCurrent(networkId: string, session: Session) {
    return !this.closed && this.options.session(networkId)?.socket === session.socket;
  }

  private requireCurrent(entry: Entry) {
    if (!this.isCurrent(entry.transfer.networkId, entry.session)) throw badRequest('The direct IRC connection is no longer active.');
  }
}

function readableTransferError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EEXIST') return 'A file appeared at the destination during the transfer. Ask the sender to offer the file again.';
  if (code === 'EADDRINUSE') return 'The listening port is already in use.';
  if (code === 'ECONNREFUSED') return 'The peer refused the connection.';
  if (code === 'ENOSPC') return 'There is not enough disk space.';
  if (code === 'EACCES' || code === 'EPERM') return 'Permission denied for the selected file or port.';
  if (code) return 'The transfer failed. Check the connection and file location.';
  return error instanceof Error ? error.message : 'The transfer failed.';
}
