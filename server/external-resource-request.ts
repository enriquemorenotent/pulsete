import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';

export type ResourceAddress = { address: string; family: 4 | 6 };
export type ResourceResponse = { body: Buffer; contentType: string; location: string | null; status: number };
export type ResourceLimits = { maxBytes: number; timeoutMs: number; headersOnlyForImages?: boolean };
export type ResourceRoute = { signal: AbortSignal; connect(host: string, port: number): Promise<net.Socket> };
export const isResourceRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/** Fetch an already-validated, pinned address; routing never falls back to host DNS. */
export async function requestExternalResource(
  url: URL, address: ResourceAddress, options: ResourceLimits & {
    route?: ResourceRoute;
    accept?: string;
    userAgent?: string;
  },
): Promise<ResourceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('External content request timed out')), options.timeoutMs);
  timeout.unref();
  const signal = options.route ? AbortSignal.any([options.route.signal, controller.signal]) : controller.signal;
  let socket: net.Socket | undefined;
  let transport: net.Socket | undefined;
  let agent: http.Agent | https.Agent | undefined;
  let request: http.ClientRequest | undefined;
  let response: http.IncomingMessage | undefined;
  try {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    if (options.route) {
      socket = await connectThroughRoute(options.route, address.address, port, signal);
      // Own errors before TLS and HTTP attach their handlers.
      socket.on('error', () => {});
      signal.throwIfAborted();
      transport = url.protocol === 'https:'
        ? tls.connect({ socket, host: hostname, servername: net.isIP(hostname) ? undefined : hostname, rejectUnauthorized: true })
        : socket;
      agent = url.protocol === 'https:' ? new https.Agent() : new http.Agent();
      agent.createConnection = () => transport!;
    }
    return await new Promise<ResourceResponse>((resolve, reject) => {
      const send = url.protocol === 'https:' ? https.request : http.request;
      request = send({
        agent: agent ?? false, signal, method: 'GET',
        protocol: url.protocol, hostname: address.address, port,
        path: `${url.pathname}${url.search}`,
        servername: net.isIP(hostname) ? undefined : hostname,
        headers: {
          Host: url.host, Accept: options.accept ?? '*/*',
          'User-Agent': options.userAgent ?? 'Pulsete-Media/1.0',
          'Accept-Encoding': 'identity', Connection: 'close',
        },
      }, incoming => {
        response = incoming;
        const status = incoming.statusCode ?? 0;
        const contentType = readHeader(incoming.headers['content-type']).toLowerCase();
        const location = readHeader(incoming.headers.location) || null;
        incoming.on('error', reject);
        incoming.on('aborted', () => reject(new Error('External content response ended early')));
        if (isResourceRedirect(status) || (options.headersOnlyForImages && contentType.startsWith('image/'))) {
          resolve({ body: Buffer.alloc(0), status, contentType, location });
          return;
        }
        if (Number(incoming.headers['content-length']) > options.maxBytes) {
          reject(new Error('External content is too large'));
          return;
        }
        const chunks: Buffer[] = [];
        let length = 0;
        incoming.on('data', chunk => {
          const buffer = Buffer.from(chunk);
          length += buffer.length;
          if (length > options.maxBytes) {
            reject(new Error('External content is too large'));
            incoming.destroy();
          } else chunks.push(buffer);
        });
        incoming.on('end', () => resolve({ body: Buffer.concat(chunks), status, contentType, location }));
      });
      request.on('error', reject);
      request.end();
      transport?.resume();
    });
  } finally {
    clearTimeout(timeout);
    response?.destroy();
    request?.destroy();
    transport?.destroy();
    socket?.destroy();
    agent?.destroy();
  }
}

function connectThroughRoute(route: ResourceRoute, host: string, port: number, signal: AbortSignal): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); reject(signal.reason); return; }
    void Promise.resolve().then(() => route.connect(host, port)).then(socket => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { socket.destroy(); reject(signal.reason); }
      else resolve(socket);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

const readHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';
