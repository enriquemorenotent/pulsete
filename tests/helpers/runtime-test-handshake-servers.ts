import assert from 'node:assert/strict';
import net from 'node:net';

export const createHandshakeServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    hasConnections() {
      return sockets.size > 0;
    },
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

export const createRegisteredServer = async (received: string[]) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (nick && sawUser) {
          socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
          sawUser = false;
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    hasConnections() {
      return sockets.size > 0;
    },
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};

export const createPresenceServer = async (
  received: string[],
  nickPresence: Record<string, 'online' | 'away'>,
) => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    let nick: string | null = null;
    let sawUser = false;
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        received.push(line);
        if (line.startsWith('NICK ')) {
          nick = line.slice('NICK '.length).trim() || nick;
        }
        if (line.startsWith('USER ')) {
          sawUser = true;
        }
        if (nick && sawUser) {
          socket.write(`:irc.example 001 ${nick} :Welcome\r\n`);
          sawUser = false;
        }
        if (line.startsWith('WHO ') && nick) {
          const trackedNick = line.slice('WHO '.length).trim();
          const presence = nickPresence[trackedNick];
          if (presence) {
            const flags = presence === 'away' ? 'G' : 'H';
            socket.write(
              `:irc.example 352 ${nick} * user host server ${trackedNick} ${flags} :0 ${trackedNick}\r\n`,
            );
          }
          socket.write(
            `:irc.example 315 ${nick} ${trackedNick} :End of WHO list\r\n`,
          );
        }
        index = buffer.indexOf('\n');
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    port: address.port,
    closeConnections() {
      for (const socket of sockets) {
        socket.destroy();
      }
      sockets.clear();
    },
  };
};
