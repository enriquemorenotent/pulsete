import { constants } from 'node:fs';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { connect, createServer, type Socket } from 'node:net';
import type { FileHandle } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { dccMaxBytes } from '../shared/dcc.js';
import { dccFilename, normalizeAddress, type DccOffer } from './dcc-protocol.js';

const idleTimeout = 30_000;

function watchSocket(socket: Socket, signal: AbortSignal) {
  const abort = () => socket.destroy(new Error('Transfer cancelled.'));
  socket.setTimeout(idleTimeout, () => socket.destroy(new Error('The peer stopped responding.')));
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return () => {
    signal.removeEventListener('abort', abort);
    socket.destroy();
  };
}

const writeSocket = (socket: Socket, data: Buffer) => new Promise<void>((resolve, reject) => {
  socket.write(data, error => error ? reject(error) : resolve());
});

export async function openDccSource(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    const filename = dccFilename(basename(path));
    if (!info.isFile() || !filename || info.size > dccMaxBytes) {
      throw new Error('Choose a regular file under 4 GiB with a valid filename.');
    }
    return { file, filename, size: info.size };
  } catch (error) {
    await file.close();
    throw error;
  }
}

export async function listenForDccPeer(
  localAddress: string, port: number, signal: AbortSignal,
  advertise: (port: number) => void,
) {
  signal.throwIfAborted();
  return new Promise<Socket>((resolve, reject) => {
    let advertised = false;
    let accepted = false;
    const server = createServer({ allowHalfOpen: true, pauseOnConnect: true }, socket => {
      if (!advertised || accepted || signal.aborted || !socket.remoteAddress
          || normalizeAddress(socket.remoteAddress) === localAddress) {
        socket.destroy();
        return;
      }
      accepted = true;
      // Guard the gap between accepting the socket and starting the stream.
      socket.on('error', () => {});
      cleanup();
      resolve(socket);
    });
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      server.close();
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new Error('Transfer cancelled.'));
    const timeout = setTimeout(() => fail(new Error('Nobody connected. Check the advertised address and router port.')), 120_000);
    signal.addEventListener('abort', abort, { once: true });
    server.on('error', fail);
    server.listen(port, localAddress, () => {
      try {
        signal.throwIfAborted();
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Could not open a listening port.');
        advertise(address.port);
        advertised = true;
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Could not offer the file.'));
      }
    });
  });
}

export async function sendDccBytes(
  socket: Socket, file: FileHandle, size: number, signal: AbortSignal, progress: (bytes: number) => void,
) {
  const cleanup = watchSocket(socket, signal);
  let sent = 0;
  const send = async () => {
    if (size > 0) {
      const stream = file.createReadStream({ end: size - 1, autoClose: false, signal });
      for await (const chunk of stream) {
        sent += chunk.length;
        await writeSocket(socket, chunk);
      }
      if (sent !== size) throw new Error('The source file changed during the transfer.');
    }
    socket.end();
    await finished(socket, { readable: false, cleanup: true });
  };
  const acknowledge = async () => {
    let acknowledged = 0;
    let unused = Buffer.alloc(0);
    if (size === 0) return;
    for await (const chunk of socket.iterator({ destroyOnReturn: false })) {
      const data = unused.length ? Buffer.concat([unused, chunk]) : chunk;
      let offset = 0;
      for (; offset + 4 <= data.length; offset += 4) {
        const count = data.readUInt32BE(offset);
        if (count < acknowledged || count > sent) throw new Error('The peer sent an invalid acknowledgement.');
        acknowledged = count;
        progress(count);
      }
      if (acknowledged === size) return;
      unused = data.subarray(offset);
    }
    throw new Error('The peer disconnected before acknowledging the file.');
  };
  // Keep the reader from destroying the socket when it receives the last ack before
  // the writer finishes its half-close. Abort both sides if either side fails.
  const write = send();
  const read = acknowledge();
  try {
    await Promise.all([write, read]);
  } finally {
    cleanup();
    await Promise.allSettled([write, read]);
  }
}

export class DccDestinationExistsError extends Error {
  constructor() { super('That file already exists. Choose a new filename.'); }
}

export async function checkDccDestination(destination: string) {
  const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (existing) throw new DccDestinationExistsError();
}

export async function receiveDccFile(
  offer: DccOffer, destination: string, localAddress: string | undefined, signal: AbortSignal,
  connected: () => void, progress: (bytes: number) => void,
) {
  await checkDccDestination(destination);
  signal.throwIfAborted();
  const temporary = join(dirname(destination), `.pulsete-dcc-${randomUUID()}.part`);
  const file = await open(temporary, 'wx', 0o600);
  try {
    signal.throwIfAborted();
    const socket = connect({ host: offer.address, port: offer.port, localAddress, allowHalfOpen: true });
    const cleanup = watchSocket(socket, signal);
    let bytes = 0;
    try {
      socket.once('connect', connected);
      for await (const chunk of socket) {
        if (bytes + chunk.length > offer.size) throw new Error('The peer sent more bytes than offered.');
        await file.writeFile(chunk);
        bytes += chunk.length;
        const acknowledgement = Buffer.alloc(4);
        acknowledgement.writeUInt32BE(bytes);
        await writeSocket(socket, acknowledgement);
        progress(bytes);
      }
      if (bytes !== offer.size) throw new Error('The peer disconnected before the file was complete.');
      signal.throwIfAborted();
      await link(temporary, destination);
    } finally {
      cleanup();
    }
  } finally {
    try { await file.close(); } finally { await unlink(temporary).catch(() => {}); }
  }
}
