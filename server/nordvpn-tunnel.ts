import { createNordVpnCleanup, retryNordVpnCleanups } from './nordvpn-cleanup.js';
import { resolveNordVpnEndpoint } from './nordvpn-server.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const nordVpnImage = 'qmcgaw/gluetun@sha256:fa19cc76b2af13d57a8d3dc3066f2ada061b1c761b8aecf989b3877c0486e027';
const exec = promisify(execFile);
export type DockerCommand = (args: string[]) => Promise<string>;
const docker: DockerCommand = async args => {
  const result = await exec('docker', args, { timeout: 120_000, maxBuffer: 1024 * 1024 });
  return (args[0] === 'logs' ? result.stdout + result.stderr : result.stdout).trim();
};

export class NordVpnTunnelError extends Error {}

export class NordVpnAuthenticationError extends NordVpnTunnelError {
  constructor() {
    super('The NordVPN server rejected the VPN login. Try another country. If all countries fail, check your service credentials in Nord Account.');
    this.name = 'NordVpnAuthenticationError';
  }
}

export const tunnelArguments = (name: string, directory: string, country: string, endpoint?: string) => [
  'run', '--detach', '--rm', '--name', name, '--label', 'org.pulsete.vpn=true',
  '--cap-add=NET_ADMIN', '--device=/dev/net/tun', '--publish', '127.0.0.1::8888/tcp',
  '--mount', `type=bind,source=${directory},target=/run/secrets,readonly`,
  '--env', 'VPN_SERVICE_PROVIDER=nordvpn', '--env', 'VPN_TYPE=openvpn',
  ...(endpoint ? ['--env', `OPENVPN_ENDPOINT_IP=${endpoint}`] : []),
  '--env', 'OPENVPN_MSSFIX=1200', '--env', 'OPENVPN_FLAGS=--tun-mtu 1300',
  '--env', 'OPENVPN_PROTOCOL=udp', '--env', `SERVER_COUNTRIES=${country}`,
  '--env', 'HTTPPROXY=on', '--env', 'HTTPPROXY_LOG=off', '--env', 'FIREWALL=on',
  '--env', 'HTTP_CONTROL_SERVER_ADDRESS=127.0.0.1:8000',
  nordVpnImage,
];

export type TunnelLease = { hostname: string; port: number; username: string; password: string; release: () => Promise<void> };

async function openNordVpnTunnel(country: string, credentials: { username: string; password: string }, signal: AbortSignal, command: DockerCommand = docker, progress: (message: string) => void = () => {}, resolveEndpoint = resolveNordVpnEndpoint): Promise<TunnelLease> {
  signal.throwIfAborted();
  const name = `pulsete-vpn-${randomUUID()}`;
  const directory = await mkdtemp(join(tmpdir(), 'pulsete-vpn-'));
  const username = 'pulsete';
  const password = randomBytes(32).toString('hex');
  let containerMayExist = false;
  const release = createNordVpnCleanup(async () => {
    if (containerMayExist) {
      try {
        await command(['rm', '--force', name]);
      } catch (error) {
        // --rm containers may have exited before cleanup. Docker being
        // unavailable is different: retain the resources and retry later.
        const stderr = (error as { stderr?: unknown } | null)?.stderr;
        if (typeof stderr !== 'string' || !stderr.includes(`No such container: ${name}`)) throw error;
      }
      containerMayExist = false;
    }
    await rm(directory, { recursive: true, force: true });
  });
  try {
    for (const [file, value] of Object.entries({ openvpn_user: credentials.username, openvpn_password: credentials.password, httpproxy_user: username, httpproxy_password: password })) {
      await writeFile(join(directory, file), value, { mode: 0o600 });
    }
    signal.throwIfAborted();
    // The image is pinned; Docker downloads it on first use if necessary.
    progress(`Finding a current NordVPN server in ${country}`);
    let endpoint: Awaited<ReturnType<typeof resolveNordVpnEndpoint>>;
    try { endpoint = await resolveEndpoint(country); } catch {
      throw new NordVpnTunnelError('Could not find a current NordVPN server for this country. Check internet access and try again.');
    }
    signal.throwIfAborted();
    progress('Preparing NordVPN helper');
    containerMayExist = true;
    await command(tunnelArguments(name, directory, country, endpoint.address));
    progress(`Connecting to NordVPN in ${country}`);
    signal.throwIfAborted();
    const deadline = Date.now() + 120_000;
    let tunnelEstablished = false;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const logs = await command(['logs', '--tail', '60', name]);
      if (/AUTH_FAILED/.test(logs)) throw new NordVpnAuthenticationError();
      if ((logs.match(/Connection reset, restarting/g) ?? []).length >= 2) {
        throw new NordVpnTunnelError('NordVPN repeatedly reset the VPN connection before it became ready. Try another country or reconnect later.');
      }
      if (!tunnelEstablished && logs.includes('Initialization Sequence Completed')) {
        tunnelEstablished = true;
        progress('NordVPN tunnel established. Checking internet connectivity');
      }
      const status = await command(['inspect', '--format', '{{.State.Health.Status}}', name]);
      if (status === 'healthy') {
        const binding = await command(['port', name, '8888/tcp']);
        const match = /^127\.0\.0\.1:(\d+)$/.exec(binding);
        if (!match) throw new Error('Invalid local VPN proxy address');
        signal.throwIfAborted();
        return { hostname: endpoint.hostname, port: Number(match[1]), username, password, release };
      }
      await delay(1000, undefined, { signal });
    }
    throw new NordVpnTunnelError(tunnelEstablished
      ? 'NordVPN connected, but its internet connectivity check did not pass within two minutes.'
      : 'NordVPN did not establish a VPN connection within two minutes. Try another country.');
  } catch (error) {
    // Preserve the setup error; failed cleanup remains registered for retries.
    await release().catch(() => {});
    if (signal.aborted || error instanceof NordVpnTunnelError) throw error;
    throw new NordVpnTunnelError('Unable to start the NordVPN helper. Check that Docker is running and accessible.');
  }
}


const activeTunnels = new Map<AbortController, Promise<TunnelLease>>();
export async function startNordVpnTunnel(country: string, credentials: { username: string; password: string }, signal: AbortSignal, command: DockerCommand = docker, progress: (message: string) => void = () => {}, resolveEndpoint = resolveNordVpnEndpoint): Promise<TunnelLease> {
  const controller = new AbortController();
  const task = openNordVpnTunnel(country, credentials, AbortSignal.any([signal, controller.signal]), command, progress, resolveEndpoint);
  activeTunnels.set(controller, task);
  try {
    const lease = await task;
    return { ...lease, release: async () => {
      try { await lease.release(); } finally { activeTunnels.delete(controller); }
    } };
  } catch (error) {
    activeTunnels.delete(controller);
    throw error;
  }
}

export async function closeNordVpnTunnels() {
  const tasks = [...activeTunnels.entries()];
  for (const [controller] of tasks) controller.abort();
  await Promise.allSettled(tasks.map(async ([controller, task]) => {
    try { await (await task).release(); } finally { activeTunnels.delete(controller); }
  }));
  await retryNordVpnCleanups();
}
