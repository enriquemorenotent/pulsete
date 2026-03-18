import net from 'node:net';
import tls from 'node:tls';
import { formatTlsStatusLines } from './irc-server-log.js';
import { emitState, emitStatus } from './irc-emit.js';
import type { IrcConnectionState } from './irc-types.js';

export const connectSocket = (connection: IrcConnectionState) => {
  if (connection.socket) {
    return;
  }
  connection.clearReconnectTimer();
  connection.manualDisconnect = false;
  emitStatus(connection, `Looking up ${connection.profile.host}`);
  const socket = connection.profile.tls
    ? tls.connect({ host: connection.profile.host, port: connection.profile.port, servername: connection.profile.host })
    : net.connect({ host: connection.profile.host, port: connection.profile.port });
  connection.socket = socket;
  const isCurrentSocket = () => connection.socket === socket;
  socket.setEncoding('utf8');
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
    if (connection.profile.tls && (socket as tls.TLSSocket).authorized) {
      for (const line of formatTlsStatusLines(socket as tls.TLSSocket)) {
        emitStatus(connection, line);
      }
    }
    emitStatus(connection, 'Connected. Now logging in.');
    if (connection.profile.password) {
      connection.sendRaw(`PASS ${connection.profile.password}`);
    }
    connection.sendRaw(`NICK ${connection.profile.nick}`);
    connection.sendRaw(`USER ${connection.profile.username} 0 * :${connection.profile.realName || connection.profile.name}`);
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
      emitStatus(connection, error.message, 'error');
    }
  });
  socket.on('close', () => handleClose(connection, socket));
};

const handleClose = (connection: IrcConnectionState, socket: IrcConnectionState['socket']) => {
  if (connection.socket !== socket) {
    return;
  }
  connection.clearReconnectTimer();
  const wasConnected = connection.connected;
  connection.socket = null;
  connection.resetTransientState();
  connection.connected = false;
  connection.serverName = null;
  connection.currentNick = connection.profile.nick;
  emitState(connection);
  emitStatus(connection, wasConnected ? 'Disconnected from server' : 'Connection closed');
  if (!connection.manualDisconnect && connection.reconnectAttempts < 3) {
    const attempt = ++connection.reconnectAttempts;
    const timer = setTimeout(() => {
      connection.reconnectTimer = null;
      retryConnect(connection, attempt);
    }, 3000 * attempt);
    timer.unref?.();
    connection.reconnectTimer = timer;
  }
};

const retryConnect = (connection: IrcConnectionState, attempt: number) => {
  if (connection.socket || connection.manualDisconnect || attempt !== connection.reconnectAttempts) {
    return;
  }
  emitStatus(connection, `Reconnecting (${attempt}/3)`, 'notice');
  connection.connect(false);
};
