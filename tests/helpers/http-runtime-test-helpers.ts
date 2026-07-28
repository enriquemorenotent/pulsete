import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHttpHandler,
  type HttpHandlerOptions,
} from '../../server/http-router.js';
import { createRuntime } from '../../server/runtime.js';
import { Storage } from '../../server/storage.js';
import { attachWebSocketServer } from '../../server/ws-server.js';
import { listen } from './http-request-helpers.js';
import { closeWebSocket, connectWebSocket } from './http-websocket-test-helpers.js';

export const createHttpRuntimeContext = async (
  options: {
    handler?: HttpHandlerOptions;
    websocket?: boolean;
  } = {},
) => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-http-'));
  const storage = new Storage(join(dir, 'db.sqlite'));
  const runtime = createRuntime(storage.runtimeStore);
  const server = createServer(createHttpHandler(runtime.http, options.handler));
  if (options.websocket) {
    attachWebSocketServer(server, runtime.ws);
  }
  const port = await listen(server);
  const socket = options.websocket ? (await connectWebSocket(port)).socket : null;
  const close = async () => {
    if (socket) {
      await closeWebSocket(socket);
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())));
    storage.close();
  };
  return { close, port, runtime, server, socket, storage };
};
