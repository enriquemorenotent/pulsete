import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { connect, createServer, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { encodeDccOffer, isDccEndpointAllowed, parseDccOffer } from '../server/dcc-protocol.js';
import { DccService } from '../server/dcc-service.js';
import { listenForDccPeer, openDccSource, receiveDccFile, sendDccBytes } from '../server/dcc-streams.js';
import { IrcConnection } from '../server/irc.js';
import { createRuntime } from '../server/runtime.js';
import { Storage } from '../server/storage.js';
import { attachMockSocket } from './helpers/irc-test-socket-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';
import type { RuntimeEvent } from '../server/irc-types.js';
import { makeBuffer, makeNetwork } from './helpers/app-state-test-helpers.js';

const signal = () => AbortSignal.timeout(3000);
const loopback = '127.0.0.1';
const content = Buffer.from(Array.from({ length: 130_678 }, (_, i) => i % 256));

async function tempDirectory(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'pulsete-dcc-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function peerServer(t: TestContext, handle: (socket: Socket) => void) {
  const peers = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, socket => {
    peers.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => peers.delete(socket));
    handle(socket);
  });
  server.listen(0, loopback);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  t.after(async () => {
    for (const socket of peers) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return { address: loopback, port: address.port };
}

test('standard DCC offers round-trip quoted names and numeric IPv4 or literal IPv6', () => {
  const ipv4 = { filename: 'example file.txt', address: '8.8.8.8', port: 40341, size: 0xffffffff };
  const line = encodeDccOffer('peer', ipv4);
  assert.equal(line, 'PRIVMSG peer :\x01DCC SEND "example file.txt" 134744072 40341 4294967295\x01');
  assert.deepEqual(parseDccOffer(line!.split('\x01')[1]), ipv4);
  assert.deepEqual(parseDccOffer('DCC SEND "../test.txt" 2606:4700::1111 9001 0'), {
    filename: 'test.txt', address: '2606:4700::1111', port: 9001, size: 0,
  });
  assert.equal(encodeDccOffer('target\r\n', ipv4), null);
  for (const offer of [
    'DCC SEND x 134744072 0 3 123', 'DCC SEND x example.org 3000 1',
    'DCC SEND x 134744072 3000 4294967296', 'DCC SEND x 134744072 65536 1',
    'DCC SEND x 134744072 655 1\n', 'DCC SEND x 134744072 3000',
  ]) assert.equal(parseDccOffer(offer), null);
});

test('unusable DCC endpoints are rejected without resolving peer-supplied hostnames', () => {
  for (const address of ['127.0.0.1', '::ffff:127.1.2.3', '169.254.1.2', '224.0.0.10', '0.0.0.0', '192.0.2.1', '2001:db8::1', 'peer.example', 'fe80::2%eth0']) {
    assert.equal(isDccEndpointAllowed(address, '10.1.0.2'), false, address);
  }
  assert.equal(isDccEndpointAllowed('8.8.8.8', '10.1.0.2'), true);
  assert.equal(isDccEndpointAllowed('2606:4700::1111', '10.1.0.2'), true);
});

test('IRC emits an offer only for live DCC SEND requests from another user to us', () => {
  const events: RuntimeEvent[] = [];
  const connection = new IrcConnection(makeNetwork({ nick: 'tester' }), { onEvent: event => events.push(event) });
  const dcc = '\x01DCC SEND file.txt 134744072 5678 99\x01';
  connection.lifecycle.connected = true;
  connection.consume(`BATCH +history chathistory tester\r\n@batch=history :peer!user@host PRIVMSG tester :${dcc}\r\nBATCH -history\r\n`);
  connection.consume(`:tester!user@host PRIVMSG tester :${dcc}\r\n:irc.example PRIVMSG tester :${dcc}\r\n:peer!user@host NOTICE tester :${dcc}\r\n:peer!user@host PRIVMSG #help :${dcc}\r\n`);
  assert.equal(events.some(event => event.type === 'dcc-offer'), false);
  connection.consume(`:peer!user@host PRIVMSG tester :${dcc}\r\n`);
  assert.deepEqual(events.filter(event => event.type === 'dcc-offer').map(event => [event.nick, event.offer.filename]), [['peer', 'file.txt']]);
  assert.equal(events.some(event => event.type === 'message' && event.message.body.includes('DCC SEND')), false);
});

test('the transfer service rejects unavailable routes and does not dial during offer handling', async () => {
  const buffer = makeBuffer({ kind: 'query', target: 'peer' });
  let pickerCalls = 0;
  let available = false;
  const session = { socket: {}, localAddress: '10.1.0.2', networkName: 'Test', sendOffer: () => false };
  const service = new DccService({
    pick: async () => { pickerCalls++; return null; },
    session: () => available ? session : null,
    buffer: () => buffer,
    publish: () => {},
  });
  const offer = { filename: 'example.txt', address: '8.8.8.8', port: 4321, size: 100 };
  await assert.rejects(service.send({ bufferId: buffer.id }), /direct route/i);
  service.offer(buffer.networkId, buffer.target, offer);
  assert.equal(service.snapshot().transfers.length, 0);
  available = true;
  service.offer(buffer.networkId, buffer.target, offer);
  const [transfer] = service.snapshot().transfers;
  assert.equal(transfer.status, 'offered');
  assert.equal(pickerCalls, 0);
  available = false;
  await assert.rejects(service.accept(transfer.id), /no longer active/i);
  service.cancelNetwork(buffer.networkId);
  assert.equal(service.snapshot().transfers[0].status, 'cancelled');
  assert.equal(pickerCalls, 0);
  service.close();
});

test('sending streams exact bytes and accepts fragmented cumulative acknowledgements', async t => {
  const sourcePath = join(await tempDirectory(t), 'local.bin');
  await writeFile(sourcePath, content);
  const source = await openDccSource(sourcePath);
  t.after(() => source.file.close());
  const deadline = signal();
  let peer!: Socket;
  const accepting = listenForDccPeer(loopback, 0, deadline, port => {
    peer = connect({ host: loopback, port, localAddress: '127.0.0.2', allowHalfOpen: true });
    peer.on('error', () => {});
  });
  const socket = await accepting;
  t.after(() => { peer.destroy(); socket.destroy(); });
  const chunks: Buffer[] = [];
  let bytes = 0;
  let progress = 0;
  peer.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
    bytes += chunk.length;
    const ack = Buffer.alloc(4);
    ack.writeUInt32BE(bytes);
    peer.write(ack.subarray(0, 1));
    setImmediate(() => peer.write(ack.subarray(1)));
    peer.pause();
    setImmediate(() => peer.resume());
  });
  await sendDccBytes(socket, source.file, source.size, deadline, acknowledged => { progress = acknowledged; });
  assert.deepEqual(Buffer.concat(chunks), content);
  assert.equal(progress, content.length);
});

test('receiving publishes the exact file and sends cumulative acknowledgements', async t => {
  const directory = await tempDirectory(t);
  const destination = join(directory, 'received.bin');
  const acknowledgements: Buffer[] = [];
  const endpoint = await peerServer(t, socket => {
    socket.on('data', chunk => acknowledgements.push(chunk));
    socket.end(content);
  });
  await receiveDccFile({ ...endpoint, filename: 'some.bin', size: content.length }, destination, undefined, signal(), () => {}, () => {});
  assert.deepEqual(await readFile(destination), content);
  assert.deepEqual(await readdir(directory), ['received.bin']);
  assert.equal(Buffer.concat(acknowledgements).readUInt32BE(Buffer.concat(acknowledgements).length - 4), content.length);
});

test('short and oversized receives clean up partial files and preserve existing files', async t => {
  const directory = await tempDirectory(t);
  const destination = join(directory, 'received.bin');
  const endpoint = await peerServer(t, socket => socket.end('abc'));
  const offer = { ...endpoint, filename: 'file', size: 2 };
  const receive = (size: number) => receiveDccFile({ ...offer, size }, destination, undefined, signal(), () => {}, () => {});
  await assert.rejects(receive(2), /more bytes/);
  await assert.rejects(receive(4), /before the file was complete/);
  assert.deepEqual(await readdir(directory), []);
  await writeFile(destination, 'keep');
  await assert.rejects(receive(3), /already exists/);
  assert.equal(await readFile(destination, 'utf8'), 'keep');
});

test('cancelling a receive tears down its socket and removes the partial file', async t => {
  const directory = await tempDirectory(t);
  const endpoint = await peerServer(t, socket => { socket.write('abc'); });
  const controller = new AbortController();
  const receive = receiveDccFile(
    { ...endpoint, filename: 'file', size: 20 }, join(directory, 'received'), undefined,
    AbortSignal.any([controller.signal, signal()]), () => {}, () => controller.abort(),
  );
  await assert.rejects(receive, /cancelled/);
  assert.deepEqual(await readdir(directory), []);
});

test('an unanswered DCC send expires and closes its port', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let listening!: (port: number) => void;
  const opened = new Promise<number>(resolve => { listening = resolve; });
  const transfer = listenForDccPeer(loopback, 0, new AbortController().signal, listening);
  const port = await opened;
  t.mock.timers.tick(120_000);
  await assert.rejects(transfer, /nobody connected/i);
  const socket = connect({ host: loopback, port });
  await assert.rejects(once(socket, 'connect'), { code: 'ECONNREFUSED' });
});

test('a file created during a transfer wins the destination race', async t => {
  const directory = await tempDirectory(t);
  const destination = join(directory, 'existing.bin');
  const endpoint = await peerServer(t, socket => {
    socket.on('data', async () => {
      await writeFile(destination, 'keep');
      socket.end();
    });
    socket.write('abc');
  });
  const receive = receiveDccFile(
    { ...endpoint, filename: 'file', size: 3 }, destination, undefined, signal(), () => {}, () => {},
  );
  await assert.rejects(receive, { code: 'EEXIST' });
  assert.equal(await readFile(destination, 'utf8'), 'keep');
  assert.deepEqual(await readdir(directory), ['existing.bin']);
});

test('the runtime blocks DCC on both NordVPN tunnel and SOCKS routes before a file dialog can open', async t => {
  const directory = await tempDirectory(t);
  const storage = new Storage(join(directory, 'runtime.sqlite'));
  let dialogCalls = 0;
  const runtime = createRuntime(storage, async () => { dialogCalls++; return null; });
  t.after(() => {
    runtime.gateway.close();
    storage.close();
  });
  for (const nordVpnLocation of ['country:Germany', 'amsterdam']) {
    const network = storage.networks.upsert(createNetworkInput({
      nordVpnLocation, nordVpnUsername: 'test', nordVpnPassword: 'test',
    }));
    const profile = storage.networks.getRuntime(network.id);
    assert.ok(profile);
    const connection = new IrcConnection(profile, { onEvent: () => {} });
    const socket = attachMockSocket(connection);
    Object.defineProperty(socket, 'localAddress', { value: '10.1.0.2' });
    connection.lifecycle.connected = true;
    runtime.connections.set(network.id, connection);
    const buffer = storage.conversations.upsertQuery(network.id, 'peer');
    await assert.rejects(runtime.http.dcc!.send({ bufferId: buffer.id }), /direct route/);
    runtime.http.dcc!.offer(network.id, 'peer', { filename: 'x', address: '8.8.8.8', port: 12345, size: 1 });
  }
  assert.equal(dialogCalls, 0);
  assert.equal(runtime.http.dcc!.snapshot().transfers.length, 0);
});

test('choosing an existing destination keeps the offer available for another filename', async t => {
  const destination = join(await tempDirectory(t), 'existing.bin');
  await writeFile(destination, 'keep');
  const session = { socket: {}, localAddress: '10.1.0.2', networkName: 'Test', sendOffer: () => false };
  const service = new DccService({
    pick: async () => ++picks === 1 ? destination : null,
    session: () => session,
    buffer: () => null,
    publish: () => {},
  });
  let picks = 0;
  t.after(() => service.close());
  service.offer('network', 'peer', { filename: 'existing.bin', address: '8.8.8.8', port: 4321, size: 100 });
  const [offer] = service.snapshot().transfers;
  await service.accept(offer.id);
  const [collision] = service.snapshot().transfers;
  assert.equal(collision.status, 'offered');
  assert.match(collision.error ?? '', /file already exists/);
  await service.accept(offer.id);
  const [reopened] = service.snapshot().transfers;
  assert.equal(reopened.status, 'offered');
  assert.equal(reopened.error, undefined);
  assert.equal(picks, 2);
  assert.equal(await readFile(destination, 'utf8'), 'keep');
});
