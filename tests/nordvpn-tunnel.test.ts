import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import { startNordVpnTunnel as startTunnel, tunnelArguments } from '../server/nordvpn-tunnel.js';
const startNordVpnTunnel = (...args: Parameters<typeof startTunnel>) => startTunnel(args[0], args[1], args[2], args[3], args[4], async () => ({ address: '192.0.2.1', hostname: 'jp1234.nordvpn.com' }));
import { connectHttpTunnel } from '../server/http-proxy-tunnel.js';
import { nordVpnCountries } from '../shared/nordvpn-countries.js';
import { parseNetworkInput } from '../server/network-input.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

test('country selections support Germany and Japan but reject arbitrary Docker input', () => {
  assert.ok(nordVpnCountries.length > 100);
  for (const country of ['Germany', 'Japan']) assert.equal(parseNetworkInput(createNetworkInput({ nordVpnLocation: `country:${country}` })).nordVpnLocation, `country:${country}`);
  assert.throws(() => parseNetworkInput(createNetworkInput({ nordVpnLocation: 'country:--privileged' })));
  const args = tunnelArguments('test', '/tmp/test', 'Japan');
  assert.ok(args.includes('127.0.0.1::8888/tcp'));
  assert.ok(args.includes('FIREWALL=on'));
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.includes('--network=host'), false);
});

test('tunnel secrets stay out of Docker arguments and cleanup removes them', async () => {
  const calls: string[][] = [];
  let directory = '';
  const lease = await startNordVpnTunnel('Japan', { username: 'service-user', password: 'test-secret' }, new AbortController().signal, async args => {
    calls.push(args);
    if (args[0] === 'run') {
      directory = args.find(value => value.startsWith('type=bind,'))!.split('source=')[1]!.split(',target=')[0]!;
      assert.equal(readFileSync(`${directory}/openvpn_password`, 'utf8'), 'test-secret');
      assert.equal(statSync(`${directory}/openvpn_password`).mode & 0o777, 0o600);
    }
    if (args[0] === 'inspect') return 'healthy';
    if (args[0] === 'port') return '127.0.0.1:43210';
    return '';
  });
  assert.equal(lease.port, 43210);
  assert.equal(lease.hostname, 'jp1234.nordvpn.com');
  assert.equal(JSON.stringify(calls).includes('test-secret'), false);
  await lease.release();
  await lease.release();
  assert.equal(calls.filter(args => args[0] === 'rm').length, 1);
  assert.equal(existsSync(directory), false);
});

test('cancellation during container creation removes the container and credentials', async () => {
  const controller = new AbortController();
  const calls: string[][] = [];
  let directory = '';
  await assert.rejects(startNordVpnTunnel('Germany', { username: 'user', password: 'pass' }, controller.signal, async args => {
    calls.push(args);
    if (args[0] === 'run') {
      directory = args.find(value => value.startsWith('type=bind,'))!.split('source=')[1]!.split(',target=')[0]!;
      controller.abort();
    }
    return '';
  }));
  assert.ok(calls.some(args => args[0] === 'rm'));
  assert.equal(existsSync(directory), false);
});

for (const status of [200, 403]) test(`local HTTP tunnel ${status === 200 ? 'preserves bytes after the CONNECT response' : 'rejects failed CONNECT'}`, async () => {
  let request = '';
  const peers = new Set<net.Socket>();
  const server = net.createServer(socket => {
    peers.add(socket);
    socket.once('data', data => {
      request = data.toString();
      socket.write(`HTTP/1.1 ${status} Result\r\n\r\n:irc NOTICE hello\r\n`);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = new net.Socket();
  try {
    const pending = connectHttpTunnel(socket, { port: (server.address() as net.AddressInfo).port, username: 'local', password: 'secret' }, { host: 'irc.example.test', port: 6697 }, new AbortController().signal);
    if (status !== 200) await assert.rejects(pending, /refused/);
    else {
      const tunnel = await pending;
      assert.equal(tunnel.read()?.toString(), ':irc NOTICE hello\r\n');
    }
    assert.match(request, /^CONNECT irc.example.test:6697 HTTP\/1.1/);
    assert.ok(request.includes('Proxy-Authorization: Basic'));
  } finally {
    socket.destroy();
    for (const peer of peers) peer.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('two connections use different containers and releasing one leaves the other running', async () => {
  const running = new Set<string>();
  const command = async (args: string[]) => {
    if (args[0] === 'run') running.add(args[args.indexOf('--name') + 1]!);
    if (args[0] === 'rm') running.delete(args[2]!);
    if (args[0] === 'inspect') return 'healthy';
    if (args[0] === 'port') return '127.0.0.1:43210';
    return '';
  };
  const credentials = { username: 'user', password: 'pass' };
  const first = await startNordVpnTunnel('Germany', credentials, new AbortController().signal, command);
  const second = await startNordVpnTunnel('Japan', credentials, new AbortController().signal, command);
  try {
    assert.equal(running.size, 2);
    assert.notEqual(first.password, second.password);
    await first.release();
    assert.equal(running.size, 1);
  } finally { await first.release(); await second.release(); }
  assert.equal(running.size, 0);
});

test('NordVPN authentication rejection fails immediately with a safe actionable error and cleans up', async () => {
  let inspected = false;
  let removed = false;
  let directory = '';
  await assert.rejects(startNordVpnTunnel('Germany', { username: 'user', password: 'private-test-secret' }, new AbortController().signal, async args => {
    if (args[0] === 'run') directory = args.find(value => value.startsWith('type=bind,'))!.split('source=')[1]!.split(',target=')[0]!;
    if (args[0] === 'logs') return 'AUTH: Received control message: AUTH_FAILED\nprivate-test-secret';
    if (args[0] === 'inspect') inspected = true;
    if (args[0] === 'rm') removed = true;
    return '';
  }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'NordVpnAuthenticationError');
    assert.match(error.message, /server rejected the VPN login/);
    assert.equal(error.message.includes('private-test-secret'), false);
    return true;
  });
  assert.equal(inspected, false);
  assert.equal(removed, true);
  assert.equal(existsSync(directory), false);
});

test('VPN uses UDP and reports repeated connection resets without waiting for the full timeout', async () => {
  assert.ok(tunnelArguments('test', '/tmp/test', 'Germany').includes('OPENVPN_PROTOCOL=udp'));
  const progress: string[] = [];
  let removed = false;
  await assert.rejects(startNordVpnTunnel('Germany', { username: 'user', password: 'pass' }, new AbortController().signal, async args => {
    if (args[0] === 'logs') return 'Connection reset, restarting\nConnection reset, restarting';
    if (args[0] === 'rm') removed = true;
    return '';
  }, message => progress.push(message)), /repeatedly reset/);
  assert.deepEqual(progress, ['Finding a current NordVPN server in Germany', 'Preparing NordVPN helper', 'Connecting to NordVPN in Germany']);
  assert.equal(removed, true);
});
