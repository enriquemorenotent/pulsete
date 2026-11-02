import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import { createRuntime } from '../server/runtime.js';
import { parseNetworkInput } from '../server/network-input.js';
import { createNetworkInput, waitFor } from './helpers/runtime-test-common.js';

 test('NordVPN credentials are shared, encrypted, and excluded from public profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-nord-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  try {
    const first = storage.networks.upsert(createNetworkInput({ nordVpnLocation: 'amsterdam', nordVpnUsername: 'service-user', nordVpnPassword: 'unique-proxy-secret' }));
    const second = storage.networks.upsert(createNetworkInput({ nordVpnLocation: 'stockholm' }));
    assert.equal(second.hasNordVpnCredentials, true);
    assert.equal(storage.networks.getRuntime(second.id)?.nordVpnCredentials?.password, 'unique-proxy-secret');
    assert.equal(JSON.stringify(storage.snapshot()).includes('unique-proxy-secret'), false);
    storage.networks.upsert(createNetworkInput({ id: first.id, nordVpnLocation: '' }));
    assert.equal(storage.networks.get(first.id)?.nordVpnLocation, undefined);
    assert.equal(readFileSync(join(dir, 'db.sqlite')).includes(Buffer.from('unique-proxy-secret')), false);
    assert.throws(() => parseNetworkInput(createNetworkInput({ nordVpnLocation: 'unknown' })));
    assert.throws(() => storage.networks.upsert(createNetworkInput({ nordVpnUsername: 'only-one-field' })));
  } finally { storage.close(); rmSync(dir, { recursive: true, force: true }); }
});

for (const rejectAuth of [false, true]) test(`SOCKS5 ${rejectAuth ? 'rejects authentication without direct fallback' : 'authenticates and resolves the destination remotely'}`, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-nord-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const clients = new Set<net.Socket>();
  let destination = '';
  let login = '';
  let credentials = '';
  const server = net.createServer(socket => {
    clients.add(socket);
    let stage = 0;
    socket.on('data', data => {
      if (stage === 0) { stage++; socket.write(Buffer.from([5, 2])); }
      else if (stage === 1) {
        const length = data[1]!;
        credentials = data.subarray(2, 2 + length).toString();
        stage++; socket.write(Buffer.from([1, rejectAuth ? 1 : 0]));
      } else if (stage === 2) {
        assert.equal(data[3], 3);
        destination = data.subarray(5, 5 + data[4]!).toString();
        stage++; socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
      } else { login += data.toString(); }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  let directAttempts = 0;
  const original = net.Socket.prototype.connect;
  t.mock.method(net.Socket.prototype, 'connect', function(this: net.Socket, ...args: unknown[]) {
    const options = args[0] as { host?: string; port?: number };
    if (options?.host?.endsWith('.socks.nordhold.net')) args[0] = { host: '127.0.0.1', port };
    else if (options?.host === 'irc.example.test') directAttempts++;
    return Reflect.apply(original, this, args);
  });
  const runtime = createRuntime(storage);
  const network = storage.networks.upsert(createNetworkInput({ nordVpnLocation: 'amsterdam', nordVpnUsername: 'service-user', nordVpnPassword: 'service-secret' }));
  try {
    runtime.networks.connectNetwork(network.id);
    if (rejectAuth) {
      await waitFor(() => storage.snapshot().messages.some(message => message.body.includes('NordVPN proxy connection failed')));
      assert.equal(login, '');
      assert.equal(destination, '');
    } else {
      await waitFor(() => login.includes('NICK tester'));
      assert.equal(destination, 'irc.example.test');
    }
    assert.equal(directAttempts, 0);
    assert.equal(credentials, 'service-user');
  } finally {
    runtime.sessions.disconnect(network.id);
    for (const socket of clients) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    storage.close(); rmSync(dir, { recursive: true, force: true });
  }
});
