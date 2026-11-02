// NordVPN's published SOCKS5 endpoints, checked 2026-11-02:
// https://support.nordvpn.com/hc/en-us/articles/20195967385745
export const nordVpnLocations = [
  ['amsterdam', 'Amsterdam, Netherlands', 'amsterdam.nl.socks.nordhold.net'],
  ['stockholm', 'Stockholm, Sweden', 'stockholm.se.socks.nordhold.net'],
  ['atlanta', 'Atlanta, USA', 'atlanta.us.socks.nordhold.net'],
  ['chicago', 'Chicago, USA', 'chicago.us.socks.nordhold.net'],
  ['dallas', 'Dallas, USA', 'dallas.us.socks.nordhold.net'],
  ['los-angeles', 'Los Angeles, USA', 'los-angeles.us.socks.nordhold.net'],
  ['new-york', 'New York, USA', 'new-york.us.socks.nordhold.net'],
  ['phoenix', 'Phoenix, USA', 'phoenix.us.socks.nordhold.net'],
  ['san-francisco', 'San Francisco, USA', 'san-francisco.us.socks.nordhold.net'],
] as const;

export const nordVpnHost = (location: string) => nordVpnLocations.find(([id]) => id === location)?.[2];
