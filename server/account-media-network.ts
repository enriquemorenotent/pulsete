import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { defaultPagePreviewNetwork, isPublicIpAddress, type PagePreviewNetwork, type PagePreviewAddress, type PagePreviewNetworkResponse } from './page-preview-network.js';
import type { AccountMediaRoute } from './account-media-route.js';

// The resolver is reached through the account tunnel, never through host DNS.
const dnsEndpoint = new URL('https://cloudflare-dns.com/dns-query');
const dnsAddress: PagePreviewAddress = { address: '1.1.1.1', family: 4 };

export function createAccountMediaNetwork(route?: AccountMediaRoute): PagePreviewNetwork {
  return {
    async resolve(hostname) {
      route?.signal.throwIfAborted();
      if (!route) return defaultPagePreviewNetwork.resolve(hostname);
      const answers = await Promise.all(['A', 'AAAA'].map(async type => {
        const url = new URL(dnsEndpoint);
        url.search = new URLSearchParams({ name: hostname, type }).toString();
        const response = await requestAccountResource(url, dnsAddress, { maxBytes: 65536, timeoutMs: 10000 }, route, 'application/dns-json');
        if (response.status !== 200) throw new Error('VPN DNS lookup failed');
        const body = JSON.parse(response.body.toString('utf8')) as { Status?: number; Answer?: { type: number; data: string }[] };
        if (body.Status !== 0) throw new Error('VPN DNS lookup failed');
        return (body.Answer ?? []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => {
          const family = net.isIP(answer.data);
          if (family !== 4 && family !== 6) throw new Error('Invalid VPN DNS response');
          return { address: answer.data, family } as PagePreviewAddress;
        });
      }));
      return answers.flat();
    },
    request: (url, address, options) => requestAccountResource(url, address, options, route),
  };
}

export async function requestAccountResource(url: URL, address: PagePreviewAddress, options: { maxBytes: number; timeoutMs: number }, route?: AccountMediaRoute, accept = '*/*'): Promise<PagePreviewNetworkResponse> {
  if (!isPublicIpAddress(address.address)) throw new Error('Private media destinations are blocked');
  const signal = route ? AbortSignal.any([route.signal, AbortSignal.timeout(options.timeoutMs)]) : AbortSignal.timeout(options.timeoutMs);
  signal.throwIfAborted();
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const socket = route ? await route.connect(address.address, port) : net.connect({ host: address.address, port });
  const abort = () => socket.destroy(new Error('Media connection stopped'));
  // Install an error handler before TLS/request takes ownership of the socket.
  socket.on('error', () => {});
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) { socket.destroy(); throw new Error('Media connection stopped'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const transport = url.protocol === 'https:' ? tls.connect({ socket, host: hostname, servername: net.isIP(hostname) ? undefined : hostname, rejectUnauthorized: true }) : socket;
  const agent = url.protocol === 'https:' ? new https.Agent() : new http.Agent();
  agent.createConnection = () => transport;
  try {
    return await new Promise<PagePreviewNetworkResponse>((resolve, reject) => {
      const request = (url.protocol === 'https:' ? https.request : http.request)(url, {
        agent, signal, method: 'GET', headers: { Accept: accept, 'User-Agent': 'Pulsete-Media/1.0', 'Accept-Encoding': 'identity' },
      }, response => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
        const location = response.headers.location ?? null;
        if ([301,302,303,307,308].includes(status)) {
          resolve({ body: Buffer.alloc(0), status, contentType, location });
          response.destroy();
          return;
        }
        if (Number(response.headers['content-length']) > options.maxBytes) {
          response.destroy(new Error('External content is too large'));
        }
        const chunks: Buffer[] = [];
        let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > options.maxBytes) response.destroy(new Error('External content is too large'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve({ body: Buffer.concat(chunks), status, contentType, location }));
      });
      request.on('error', reject);
      request.end();
      transport.resume();
    });
  } finally {
    signal.removeEventListener('abort', abort);
    transport.destroy();
    agent.destroy();
  }
}
