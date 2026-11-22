import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { Address4, Address6 } from 'ip-address';
import { dccMaxBytes } from '../shared/dcc.js';

export type DccOffer = { filename: string; address: string; port: number; size: number };

const decimal = (value: string, max: number) =>
  /^\d{1,10}$/.test(value) && Number(value) <= max ? Number(value) : null;

export const dccFilename = (name: string) => {
  const filename = (name.split(/[/\\]/).at(-1) ?? '').replace(/[\p{Cc}\p{Cf}"<>:|?*]/gu, '_').trim();
  return filename && filename !== '.' && filename !== '..' && Buffer.byteLength(filename) <= 240
    ? filename : null;
};

export function parseDccOffer(ctcp: string): DccOffer | null {
  if (/[\p{Cc}]/u.test(ctcp)) return null;
  const match = /^DCC +SEND +(?:"([^"]+)"|([^ "]+)) +([^ ]+) +(\d+) +(\d+)$/i.exec(ctcp);
  if (!match) return null;
  const filename = dccFilename(match[1] ?? match[2]);
  const encoded = decimal(match[3], dccMaxBytes);
  const address = encoded === null ? normalizeAddress(match[3]) : Address4.fromInteger(encoded).correctForm();
  const port = decimal(match[4], 65535);
  const size = decimal(match[5], dccMaxBytes);
  return filename && address && port && size !== null ? { filename, address, port, size } : null;
}

export function encodeDccOffer(peer: string, offer: DccOffer) {
  if (!peer || /^[#:]/.test(peer) || /[\s,\p{Cc}]/u.test(peer)) return null;
  const { filename, address, port, size } = offer;
  const advertised = isIP(address) === 4 ? new Address4(address).bigInt().toString() : address;
  const wireName = filename.includes(' ') ? `"${filename}"` : filename;
  const raw = `PRIVMSG ${peer} :\x01DCC SEND ${wireName} ${advertised} ${port} ${size}\x01`;
  return Buffer.byteLength(raw) <= 510 ? raw : null;
}

export function normalizeAddress(value: string) {
  if (value.includes('%')) return null;
  switch (isIP(value)) {
    case 4: return new Address4(value).correctForm();
    case 6: {
      const address = new Address6(value);
      return address.isMapped4() ? address.to4().correctForm() : address.correctForm();
    }
    default: return null;
  }
}

export function isDccEndpointAllowed(value: string, localAddress: string) {
  const address = normalizeAddress(value);
  const local = normalizeAddress(localAddress);
  if (!address || !local || address === local) return false;
  const interfaces = Object.values(networkInterfaces()).flatMap(entries => entries ?? []);
  if (interfaces.some(entry => normalizeAddress(entry.address) === address)) return false;

  if (isIP(address) === 4) {
    const peer = new Address4(address);
    if (peer.isGlobal()) return true;
    if (!peer.isPrivate()) return false;
    return interfaces.some(entry => {
      if (entry.family !== 'IPv4' || !entry.cidr || normalizeAddress(entry.address) !== local) return false;
      const subnet = new Address4(entry.cidr);
      return peer.isHostInSubnet(subnet)
        && address !== subnet.startAddress().correctForm() && address !== subnet.endAddress().correctForm();
    });
  }
  const peer = new Address6(address);
  if (peer.isGlobal()) return true;
  return peer.isULA() && interfaces.some(entry =>
    entry.family === 'IPv6' && entry.cidr && normalizeAddress(entry.address) === local
    && peer.isHostInSubnet(new Address6(entry.cidr)));
}

export function isDccAdvertisedAddressAllowed(address: string, localAddress: string) {
  if (isIP(address) !== isIP(localAddress)) return false;
  if (isIP(address) === 4) {
    const ip = new Address4(address);
    return ip.isGlobal() || (address === localAddress && ip.isPrivate());
  }
  const ip = new Address6(address);
  return ip.isGlobal() || (address === localAddress && ip.isULA());
}
