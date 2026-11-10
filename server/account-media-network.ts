import net from 'node:net';
import { requestExternalResource, type ResourceLimits } from './external-resource-request.js';
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

export async function requestAccountResource(url: URL, address: PagePreviewAddress, options: ResourceLimits, route?: AccountMediaRoute, accept = '*/*'): Promise<PagePreviewNetworkResponse> {
  if (!isPublicIpAddress(address.address)) throw new Error('Private media destinations are blocked');
  return requestExternalResource(url, address, { ...options, route, accept });
}
