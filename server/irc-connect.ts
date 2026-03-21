import net from 'node:net';
import tls from 'node:tls';
import { formatTlsStatusLines } from './irc-server-log.js';
import { emitStatus } from './irc-emit.js';
import type { IrcConnectionState } from './irc-types.js';

const defaultConnectTimeoutMs = 15_000;

export const connectSocket = (connection: IrcConnectionState) => {
  if (connection.lifecycle.socket) {
    return;
  }
  connection.clearReconnectTimer();
  emitStatus(connection, `Looking up ${connection.profile.host}`);
  const socket = connection.profile.tls
    ? tls.connect({ host: connection.profile.host, port: connection.profile.port, servername: connection.profile.host })
    : net.connect({ host: connection.profile.host, port: connection.profile.port });
  connection.openSocket(socket);
  const isCurrentSocket = () => connection.lifecycle.socket === socket;
  socket.setEncoding('utf8');
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
    const loginLines = [
      ...(connection.profile.password ? [`PASS ${connection.profile.password}`] : []),
      `NICK ${connection.profile.nick}`,
      `USER ${connection.profile.username} 0 * :${connection.profile.realName || connection.profile.name}`,
    ];
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
    socket.on('connect', beginLogin);
  }
  socket.on('data', (chunk) => {
    if (isCurrentSocket()) {
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
