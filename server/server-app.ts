import { createServer, type Server } from 'node:http';
import { resolveAppPaths, type AppPathInput } from './app-paths.js';
import { createHttpHandler } from './http-router.js';
import { RuntimeHost } from './runtime-host.js';
import { createRequestOriginPolicy } from './request-origin-policy.js';
import { attachWebSocketServer } from './ws-server.js';

export type PulseteServerOptions = AppPathInput & {
  allowedOrigins?: readonly string[];
  assetRoot?: string;
  host?: string;
  port?: number;
};

export type PulseteServerHandle = {
  close: () => Promise<void>;
  host: string;
  port: number;
  server: Server;
  url: string;
};

export const startPulseteServer = async (options: PulseteServerOptions = {}): Promise<PulseteServerHandle> => {
  const listenHost = options.host ?? '127.0.0.1';
  const listenPort = options.port ?? Number(process.env.PORT ?? 18487);
  const originPolicy = createRequestOriginPolicy(options.allowedOrigins);
  const runtimeHost = new RuntimeHost(resolveAppPaths(options));
  const server = createServer(createHttpHandler(runtimeHost.http, {
    assetRoot: options.assetRoot,
    originPolicy,
  }));
  let closed = false;

  attachWebSocketServer(server, runtimeHost.ws, { originPolicy });
  server.on('close', () => {
    runtimeHost.close();
  });

  await listen(server, listenPort, listenHost, () => {
    closed = true;
    runtimeHost.close();
  });

  const port = resolveListeningPort(server, listenPort);
  const url = `http://${listenHost}:${port}`;
  originPolicy.addAllowedOrigin(url);
  return {
    server,
    host: listenHost,
    port,
    url,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await closeServer(server);
    },
  };
};

const listen = (
  server: Server,
  port: number,
  host: string,
  onFailure: () => void
) => new Promise<void>((resolve, reject) => {
  const handleError = (error: Error) => {
    onFailure();
    reject(error);
  };
  server.once('error', handleError);
  server.listen(port, host, () => {
    server.off('error', handleError);
    resolve();
  });
});

const closeServer = (server: Server) => new Promise<void>((resolve, reject) => {
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  });
});

const resolveListeningPort = (server: Server, fallback: number) => {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : fallback;
};
