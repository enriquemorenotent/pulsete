import net from 'node:net';
import tls from 'node:tls';
import { NordVpnTunnelError, startNordVpnTunnel } from './nordvpn-tunnel.js';
import { connectHttpTunnel } from './http-proxy-tunnel.js';
import type { IrcConnectContext } from './irc-contexts.js';
import { emitState, emitStatus } from './irc-emit.js';

export function connectNordVpnCountry(connection: IrcConnectContext, country: string, attach: (connection: IrcConnectContext, socket: net.Socket | tls.TLSSocket, connected?: boolean) => void) {
  const controller = new AbortController();
  const pending = new net.Socket();
  connection.openSocket(pending);
  let release: (() => Promise<void>) | undefined;
  connection.lifecycle.stopVpnTunnel = () => {
    controller.abort();
    pending.destroy();
    if (release) void release().catch(() => console.error('Could not remove a Pulsete VPN container. Check Docker.'));
  };
  const current = () => !controller.signal.aborted && connection.lifecycle.socket === pending;
  emitStatus(connection, `Preparing VPN connection to ${country}`);
  const run = async () => {
    const credentials = connection.profile.nordVpnCredentials;
    if (!credentials) throw new Error('Enter NordVPN service credentials first');
    const lease = await startNordVpnTunnel(country, credentials, controller.signal, undefined, message => {
      if (current()) emitStatus(connection, message);
    });
    release = lease.release;
    if (!current()) { await release(); return; }
    connection.lifecycle.vpnServer = lease.hostname;
    emitState(connection);
    emitStatus(connection, 'NordVPN is ready. Connecting to the IRC server');
    const socket = await connectHttpTunnel(pending, lease, connection.profile, controller.signal);
    if (!current()) { socket.destroy(); await release(); return; }
    const transport = connection.profile.tls ? tls.connect({ socket, servername: connection.profile.host }) : socket;
    attach(connection, transport, !connection.profile.tls);
    transport.resume();
  };
  void run().catch(error => {
    if (!current()) return;
    if (error instanceof NordVpnTunnelError) connection.lifecycle.reconnectAttempts = 3;
    connection.markConnectionFailure(error instanceof Error ? error.message : 'NordVPN tunnel failed');
    pending.destroy();
    connection.handleSocketClosed(pending);
  });
}
