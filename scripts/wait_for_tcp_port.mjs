import net from 'node:net';

const [, , host = '127.0.0.1', portValue = '18487', timeoutValue = '30000'] = process.argv;
const port = Number(portValue);
const timeoutMs = Number(timeoutValue);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid port: ${portValue}`);
}

if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid timeout: ${timeoutValue}`);
}

const startedAt = Date.now();

const canConnect = () => new Promise((resolve) => {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(500);
  socket.once('connect', () => {
    socket.destroy();
    resolve(true);
  });
  socket.once('error', () => {
    socket.destroy();
    resolve(false);
  });
  socket.once('timeout', () => {
    socket.destroy();
    resolve(false);
  });
});

while (Date.now() - startedAt < timeoutMs) {
  if (await canConnect()) {
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

console.error(`Timed out waiting for ${host}:${port}`);
process.exit(1);
