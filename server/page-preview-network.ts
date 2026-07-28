import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import {
  request as httpsRequest,
  type RequestOptions,
} from 'node:https';
import { isIP } from 'node:net';

export type PagePreviewAddress = {
  address: string;
  family: 4 | 6;
};

export type PagePreviewNetworkResponse = {
  body: Buffer;
  contentType: string;
  location: string | null;
  status: number;
};

export type PagePreviewNetwork = {
  request(
    url: URL,
    address: PagePreviewAddress,
    options: { maxBytes: number; timeoutMs: number },
  ): Promise<PagePreviewNetworkResponse>;
  resolve(hostname: string): Promise<readonly PagePreviewAddress[]>;
};

export const resolvePublicPagePreviewAddress = async (
  url: URL,
  network: PagePreviewNetwork,
): Promise<PagePreviewAddress | null> => {
  if (!isAllowedPagePreviewUrl(url)) {
    return null;
  }

  const hostname = stripIpv6Brackets(url.hostname);
  const family = isIP(hostname);
  if (family === 4 || family === 6) {
    return isPublicIpAddress(hostname)
      ? { address: hostname, family }
      : null;
  }
  if (isBlockedHostname(hostname)) {
    return null;
  }

  const addresses = await network.resolve(hostname);
  if (
    addresses.length === 0
    || addresses.some((entry) => !isPublicIpAddress(entry.address))
  ) {
    return null;
  }
  return addresses[0] ?? null;
};

export const isAllowedPagePreviewUrl = (url: URL) => {
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username
    || url.password
  ) {
    return false;
  }
  if (!url.port) {
    return true;
  }
  return (
    (url.protocol === 'http:' && url.port === '80')
    || (url.protocol === 'https:' && url.port === '443')
  );
};

export const isPublicIpAddress = (address: string) => {
  const family = isIP(address);
  if (family === 4) {
    return isPublicIpv4(address);
  }
  if (family === 6) {
    return isPublicIpv6(address);
  }
  return false;
};

const requestPageResource: PagePreviewNetwork['request'] = (
  url,
  address,
  options,
) => new Promise((resolve, reject) => {
  const originalHostname = stripIpv6Brackets(url.hostname);
  const requestOptions: RequestOptions = {
    agent: false,
    headers: {
      Accept: 'text/html,application/xhtml+xml,image/*;q=0.8',
      'Accept-Encoding': 'identity',
      Connection: 'close',
      Host: url.host,
      'User-Agent': 'Pulsete-Link-Preview/1.0',
    },
    hostname: address.address,
    method: 'GET',
    path: `${url.pathname}${url.search}`,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol,
    servername: isIP(originalHostname) === 0 ? originalHostname : undefined,
  };
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const succeed = (value: PagePreviewNetworkResponse) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout) {
      clearTimeout(timeout);
    }
    resolve(value);
  };
  const fail = (error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout) {
      clearTimeout(timeout);
    }
    reject(error);
  };

  const request = transport(requestOptions, (response) => {
    const status = response.statusCode ?? 0;
    const contentType = readHeader(response.headers['content-type']).toLowerCase();
    const location = readHeader(response.headers.location) || null;
    if (isRedirectStatus(status) || contentType.startsWith('image/')) {
      succeed({
        body: Buffer.alloc(0),
        contentType,
        location,
        status,
      });
      response.destroy();
      return;
    }

    const declaredLength = Number(response.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      fail(new Error('Page preview response is too large'));
      response.destroy();
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    response.on('data', (chunk) => {
      const buffer = Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > options.maxBytes) {
        fail(new Error('Page preview response is too large'));
        response.destroy();
        return;
      }
      chunks.push(buffer);
    });
    response.on('end', () => {
      succeed({
        body: Buffer.concat(chunks),
        contentType,
        location,
        status,
      });
    });
    response.on('error', (error) => {
      fail(error);
    });
  });

  timeout = setTimeout(() => {
    request.destroy(new Error('Page preview request timed out'));
  }, options.timeoutMs);
  timeout.unref();
  request.on('error', (error) => {
    fail(error);
  });
  request.end();
});

export const defaultPagePreviewNetwork: PagePreviewNetwork = {
  async resolve(hostname) {
    const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    return addresses.flatMap<PagePreviewAddress>((entry) =>
      entry.family === 4 || entry.family === 6
        ? [{ address: entry.address, family: entry.family }]
        : [])
      .sort((left, right) => left.family - right.family);
  },
  request: requestPageResource,
};

const readHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

const isRedirectStatus = (status: number) =>
  status === 301
  || status === 302
  || status === 303
  || status === 307
  || status === 308;

const stripIpv6Brackets = (hostname: string) =>
  hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase().replace(/\.+$/, '');
  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.lan')
    || normalized.endsWith('.home')
    || normalized.endsWith('.test')
    || normalized.endsWith('.invalid')
  );
};

const isPublicIpv4 = (address: string) => {
  const value = parseIpv4(address);
  if (value === null) {
    return false;
  }
  return !blockedIpv4Ranges.some(([network, prefix]) =>
    isIpv4InRange(value, network, prefix));
};

const blockedIpv4Ranges: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

const parseIpv4 = (address: string) => {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
};

const isIpv4InRange = (value: number, network: number, prefix: number) => {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
};

const isPublicIpv6 = (address: string) => {
  const value = parseIpv6(address);
  if (value === null || (value >> 125n) !== 1n) {
    return false;
  }
  return (
    (value >> 96n) !== 0x20010db8n
    && (value >> 80n) !== 0x200100020000n
    && (value >> 112n) !== 0x2002n
    && (value >> 100n) !== 0x2001001n
    && (value >> 100n) !== 0x2001002n
  );
};

const parseIpv6 = (address: string) => {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  if (!normalized || normalized.includes('.')) {
    return null;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (
    missing < 0
    || (halves.length === 1 && missing !== 0)
    || (halves.length === 2 && missing < 1)
  ) {
    return null;
  }
  const segments = [
    ...head,
    ...Array.from({ length: missing }, () => '0'),
    ...tail,
  ];
  if (
    segments.length !== 8
    || segments.some((segment) => !/^[\da-f]{1,4}$/.test(segment))
  ) {
    return null;
  }
  return segments.reduce(
    (value, segment) => (value << 16n) | BigInt(`0x${segment}`),
    0n,
  );
};
