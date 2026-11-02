import { registerAccountMediaRoute } from './account-media-route.js';
import { nordVpnCountry } from '../shared/nordvpn-countries.js';
import { connectNordVpnCountry } from './irc-nordvpn-tunnel.js';
import { SocksClient } from 'socks';
import { nordVpnHost } from '../shared/nordvpn.js';
import net from 'node:net';
import tls from 'node:tls';
import type { IrcConnectContext } from './irc-contexts.js';
import { buildRegistrationLines } from './irc-auth.js';
import { formatTlsStatusLines } from './irc-server-log.js';
import { emitStatus } from './irc-emit.js';
import {
  enableIrcSocketKeepAlive,
  recordIrcHeartbeatActivity,
} from './irc-connection-heartbeat.js';

const defaultConnectTimeoutMs = 15_000;

export const connectSocket = (connection: IrcConnectContext) => {
  if (connection.lifecycle.socket) {
    return;
  }
  connection.clearReconnectTimer();
  const country = nordVpnCountry(connection.profile.nordVpnLocation ?? '');
  if (country) {
    connectNordVpnCountry(connection, country, attachSocket);
    return;
  }
  if (connection.profile.nordVpnLocation) {
    connectProxy(connection);
    return;
  }
  emitStatus(connection, `Looking up ${connection.profile.host}`);
  const socket = connection.profile.tls
    ? tls.connect({ host: connection.profile.host, port: connection.profile.port, servername: connection.profile.host })
    : net.connect({ host: connection.profile.host, port: connection.profile.port });
  attachSocket(connection, socket);
};

const attachSocket = (connection: IrcConnectContext, socket: net.Socket | tls.TLSSocket, alreadyConnected = false) => {
  connection.openSocket(socket);
  const isCurrentSocket = () => connection.lifecycle.socket === socket;
  socket.setEncoding('utf8');
  enableIrcSocketKeepAlive(socket, connection.lifecycle.heartbeat.idleMs);
  const connectDeadline = setTimeout(() => {
    if (!isCurrentSocket() || connection.lifecycle.connected) {
      return;
    }
    connection.markConnectionFailure('Connection timed out');
    socket.destroy();
  }, getConnectTimeoutMs());
  connectDeadline.unref?.();
  connection.setConnectDeadlineTimer(connectDeadline);
  socket.on('lookup', (_error, address, _family, host) => {
    if (!isCurrentSocket()) {
      return;
    }
    const destination = host ?? connection.profile.host;
    emitStatus(connection, address ? `Connecting to ${destination} (${address}:${connection.profile.port})` : `Connecting to ${destination}:${connection.profile.port}`);
  });
  const beginLogin = () => {
    if (!isCurrentSocket()) {
      return;
    }
    connection.beginLogin();
    if (connection.profile.tls && (socket as tls.TLSSocket).authorized) {
      for (const line of formatTlsStatusLines(socket as tls.TLSSocket)) {
        emitStatus(connection, line);
      }
    }
    emitStatus(connection, 'Connected. Now logging in.');
    const loginLines = buildRegistrationLines(connection.profile);
    const sentAllLoginLines = loginLines.every((line) => connection.sendRaw(line));
    if (!sentAllLoginLines) {
      if (!connection.lifecycle.lastFailureMessage) {
        connection.markConnectionFailure('Login command exceeded the IRC line limit');
      }
      socket.destroy();
      return;
    }
  };
  if (connection.profile.tls) {
    (socket as tls.TLSSocket).on('secureConnect', beginLogin);
  } else {
    if (alreadyConnected) beginLogin();
    else socket.on('connect', beginLogin);
  }
  socket.on('data', (chunk) => {
    if (isCurrentSocket()) {
      recordIrcHeartbeatActivity(connection);
      connection.consume(chunk);
    }
  });
  socket.on('error', (error) => {
    if (isCurrentSocket()) {
      connection.markConnectionFailure(error.message);
    }
  });
  socket.on('close', () => connection.handleSocketClosed(socket));
};

const getConnectTimeoutMs = () => {
  const parsed = Number(process.env.PULSETE_IRC_CONNECT_TIMEOUT_MS ?? defaultConnectTimeoutMs);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultConnectTimeoutMs;
};

const connectProxy = (connection: IrcConnectContext) => {
  const profile = connection.profile;
  const raw = new net.Socket();
  const mediaController = new AbortController();
  connection.lifecycle.stopAccountMedia = () => mediaController.abort();
  connection.openSocket(raw);
  const current = () => connection.lifecycle.socket === raw;
  const host = nordVpnHost(profile.nordVpnLocation ?? '');
  const credentials = profile.nordVpnCredentials;
  const fail = () => {
    if (!current()) return;
    connection.markConnectionFailure('NordVPN proxy connection failed. Check service credentials and location.');
    raw.destroy();
  };
  raw.on('error', fail);
  raw.on('close', () => connection.handleSocketClosed(raw));
  const deadline = setTimeout(fail, getConnectTimeoutMs());
  deadline.unref?.();
  connection.setConnectDeadlineTimer(deadline);
  if (!host || !credentials) {
    fail();
    return;
  }
  emitStatus(connection, `Connecting through NordVPN (${profile.nordVpnLocation})`);
  raw.connect({ host, port: 1080 }, () => {
    if (!current()) { raw.destroy(); return; }
    void SocksClient.createConnection({
      command: 'connect',
      proxy: { host, port: 1080, type: 5, userId: credentials.username, password: credentials.password },
      destination: { host: profile.host, port: profile.port },
      existing_socket: raw,
      timeout: getConnectTimeoutMs(),
    }).then(({ socket }) => {
      if (!current()) { socket.destroy(); return; }
      clearTimeout(deadline);
      raw.removeListener('error', fail);
      raw.removeAllListeners('close');
      const transport = profile.tls ? tls.connect({ socket, servername: profile.host }) : socket;
      registerAccountMediaRoute(profile.id, {
        location: profile.nordVpnLocation!, signal: mediaController.signal,
        connect: async (destinationHost, destinationPort) => {
          mediaController.signal.throwIfAborted();
          const mediaSocket = new net.Socket();
          const abort = () => mediaSocket.destroy();
          mediaController.signal.addEventListener('abort', abort, { once: true });
          mediaSocket.once('close', () => mediaController.signal.removeEventListener('abort', abort));
          try {
            await new Promise<void>((resolve, reject) => {
              mediaSocket.once('error', reject);
              mediaSocket.once('close', () => reject(new Error('VPN media connection closed')));
              mediaSocket.setTimeout(10000, () => mediaSocket.destroy(new Error('VPN media connection timed out')));
              mediaSocket.connect({ host, port: 1080 }, resolve);
            });
            const result = await SocksClient.createConnection({
              command: 'connect', proxy: { host, port: 1080, type: 5, userId: credentials.username, password: credentials.password },
              destination: { host: destinationHost, port: destinationPort }, existing_socket: mediaSocket, timeout: 10000,
            });
            mediaController.signal.throwIfAborted();
            mediaSocket.setTimeout(0);
            return result.socket;
          } catch (error) { mediaSocket.destroy(); throw error; }
        },
      });
      attachSocket(connection, transport, !profile.tls);
    }).catch(fail);
  });
};
