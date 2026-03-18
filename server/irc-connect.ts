import net from 'node:net';
import tls from 'node:tls';
import { formatTlsStatusLines } from './irc-server-log.js';
import { emitState, emitStatus } from './irc-emit.js';
import type { IrcConnectionState } from './irc-types.js';

export const connectSocket = (connection: IrcConnectionState) => {
  if (connection.socket) {
    return;
  }
  connection.manualDisconnect = false;
  emitStatus(connection, `Looking up ${connection.profile.host}`);
  const socket = connection.profile.tls
    ? tls.connect({ host: connection.profile.host, port: connection.profile.port, servername: connection.profile.host })
    : net.connect({ host: connection.profile.host, port: connection.profile.port });
  connection.socket = socket;
  socket.setEncoding('utf8');
  socket.on('lookup', (_error, address, _family, host) => {
    const destination = host ?? connection.profile.host;
    emitStatus(connection, address ? `Connecting to ${destination} (${address}:${connection.profile.port})` : `Connecting to ${destination}:${connection.profile.port}`);
  });
  socket.on('connect', () => {
    if (connection.profile.password) {
      connection.sendRaw(`PASS ${connection.profile.password}`);
    }
    if (socket instanceof tls.TLSSocket && socket.authorized) {
      for (const line of formatTlsStatusLines(socket)) {
        emitStatus(connection, line);
      }
    }
    emitStatus(connection, 'Connected. Now logging in.');
    connection.sendRaw(`NICK ${connection.profile.nick}`);
    connection.sendRaw(`USER ${connection.profile.username} 0 * :${connection.profile.realName || connection.profile.name}`);
  });
  socket.on('data', (chunk) => connection.consume(chunk));
  socket.on('error', (error) => emitStatus(connection, error.message, 'error'));
  socket.on('close', () => handleClose(connection));
};

const handleClose = (connection: IrcConnectionState) => {
  const wasConnected = connection.connected;
  connection.socket = null;
  connection.connected = false;
  connection.serverName = null;
  emitState(connection);
  emitStatus(connection, wasConnected ? 'Disconnected from server' : 'Connection closed');
  if (!connection.manualDisconnect && connection.reconnectAttempts < 3) {
    const attempt = ++connection.reconnectAttempts;
    setTimeout(() => retryConnect(connection, attempt), 3000 * attempt);
  }
};

const retryConnect = (connection: IrcConnectionState, attempt: number) => {
  if (connection.socket || connection.manualDisconnect || attempt !== connection.reconnectAttempts) {
    return;
  }
  emitStatus(connection, `Reconnecting (${attempt}/3)`, 'notice');
  connection.connect();
};
