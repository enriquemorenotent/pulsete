import { nordVpnCountryFlag } from '../../shared/nordvpn-country-flags.js';
import { Globe, Shield, ShieldCheck } from 'lucide-react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';
import { nordVpnCountry } from '../../shared/nordvpn-countries.js';
import { nordVpnLocations } from '../../shared/nordvpn.js';
import { cn } from '@/lib/utils.js';

export function connectionRouteLabel(network: NetworkProfile, phase: NetworkRuntimeState['phase'], vpnServer?: string) {
  const location = network.nordVpnLocation;
  if (!location) return null;
  const country = nordVpnCountry(location);
  const proxy = nordVpnLocations.find(([id]) => id === location);
  if (!country && !proxy) return null;
  const service = country ? 'NordVPN tunnel' : 'NordVPN SOCKS5 proxy';
  const destination = country ?? proxy![1];
  const state = phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting' : 'Configured, offline';
  return `${service} · ${destination}${country && phase !== 'offline' && vpnServer ? ` · ${vpnServer}` : ''} · ${state}`;
}

export function ConnectionRouteBadge({ network, phase, vpnServer, embedded = false }: { network: NetworkProfile; phase: NetworkRuntimeState['phase']; vpnServer?: string; embedded?: boolean }) {
  const label = connectionRouteLabel(network, phase, vpnServer);
  if (!label) return null;
  const vpn = Boolean(nordVpnCountry(network.nordVpnLocation ?? ''));
  const Icon = vpn ? (phase === 'connected' ? ShieldCheck : Shield) : Globe;
  const serverNumber = vpn && phase !== 'offline' ? /^[a-z]{2}(\d+)\.nordvpn\.com$/.exec(vpnServer ?? '')?.[1] : undefined;
  const text = vpn ? 'VPN' : 'Proxy';
  const flag = nordVpnCountryFlag(network.nordVpnLocation ?? '');
  return <span role="img" aria-label={label} title={label} className={cn(
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-medium leading-none',
    embedded ? 'w-[104px] justify-center self-stretch rounded-r-lg border-l px-1.5' : 'rounded border px-1.5 py-0.5',
    phase === 'connected' ? 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
      : phase === 'connecting' ? 'border-amber-400/15 bg-amber-400/5 text-amber-300'
        : 'border-border/60 text-muted-foreground',
  )}>
    {flag ? <span aria-hidden="true" className="text-xs leading-none">{flag}</span> : null}
    <Icon aria-hidden="true" className="size-3" />
    <span aria-hidden="true">{text}{serverNumber ? ` #${serverNumber}` : ''}</span>
  </span>;
}
