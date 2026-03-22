import { createServer } from 'node:http';
import { createHttpHandler } from './http-router.js';
import { Runtime } from './runtime.js';
import { Storage } from './storage.js';
import { attachWebSocketServer } from './ws-server.js';

const PORT = Number(process.env.PORT ?? 18487);
const HOST = process.env.HOST ?? '127.0.0.1';
const storage = new Storage();
const runtime = new Runtime(storage);
const server = createServer(createHttpHandler(runtime.context));

attachWebSocketServer(server, runtime.context);
server.on('close', () => {
  runtime.gateway.close();
  storage.close();
});

server.listen(PORT, HOST, () => {
  console.log(`Pulsete server listening on http://${HOST}:${PORT}`);
});
