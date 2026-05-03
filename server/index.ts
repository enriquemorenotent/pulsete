import { createServer } from 'node:http';
import { resolveAppPaths } from './app-paths.js';
import { createHttpHandler } from './http-router.js';
import { RuntimeHost } from './runtime-host.js';
import { attachWebSocketServer } from './ws-server.js';

const PORT = Number(process.env.PORT ?? 18487);
const HOST = process.env.HOST ?? '127.0.0.1';
const host = new RuntimeHost(resolveAppPaths());
const server = createServer(createHttpHandler(host.http));

attachWebSocketServer(server, host.ws);
server.on('close', () => {
  host.close();
});

server.listen(PORT, HOST, () => {
  console.log(`Pulsete server listening on http://${HOST}:${PORT}`);
});
