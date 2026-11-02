import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { NetworkProfile, NetworkRuntimeState } from '../../shared/protocol-chat.js';

const MediaAccountContext = createContext({ networkId: undefined as string | undefined, cacheKey: 'unassigned' });
export function AccountMediaProvider({ network, runtime, children }: { network: NetworkProfile | null; runtime?: NetworkRuntimeState | null; children: ReactNode }) {
  const value = useMemo(() => ({ networkId: network?.id, cacheKey: [network?.id, network?.nordVpnLocation, runtime?.phase, runtime?.vpnServer].join(':') }), [network?.id, network?.nordVpnLocation, runtime?.phase, runtime?.vpnServer]);
  return <MediaAccountContext.Provider value={value}>{children}</MediaAccountContext.Provider>;
}
export const useMediaAccount = () => useContext(MediaAccountContext);
export function accountMediaUrl(source: string | null | undefined, networkId?: string): string | undefined {
  if (!source) return undefined;
  if (/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(source) || source.startsWith('blob:')) return source;
  if (source.startsWith('/api/media/resource?')) return source;
  if (!/^https?:\/\//i.test(source)) return undefined;
  const params = new URLSearchParams({ url: source });
  if (networkId) params.set('networkId', networkId);
  return `/api/media/resource?${params}`;
}
export function useAccountMediaUrl(source: string | null | undefined, networkId?: string) {
  const account = useMediaAccount();
  const url = accountMediaUrl(source, networkId ?? account.networkId);
  // Changing the route/session retries previously unavailable content without sharing cache keys.
  return url?.startsWith('/api/media/resource?') ? `${url}&route=${encodeURIComponent(account.cacheKey)}` : url;
}
