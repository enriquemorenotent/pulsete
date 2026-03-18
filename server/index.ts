import { createServer } from 'node:http';
import { createHttpHandler } from './http-router.js';
import { Runtime } from './runtime.js';
import { Storage } from './storage.js';
import { attachWebSocketServer } from './ws-server.js';

const PORT = Number(process.env.PORT ?? 18487);
const storage = new Storage();
const runtime = new Runtime(storage);
const server = createServer(createHttpHandler({ storage, runtime }));

attachWebSocketServer(server, { storage, runtime });

server.listen(PORT, () => {
  console.log(`Pulsete server listening on http://127.0.0.1:${PORT}`);
});
