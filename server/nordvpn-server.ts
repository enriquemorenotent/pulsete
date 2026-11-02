import { isIP } from 'node:net';

export async function resolveNordVpnEndpoint(country: string, request: typeof fetch = fetch): Promise<{ address: string; hostname: string }> {
  const countriesResponse = await request('https://api.nordvpn.com/v1/servers/countries', { signal: AbortSignal.timeout(15000) });
  if (!countriesResponse.ok) throw new Error('Country lookup failed');
  const countries: unknown = await countriesResponse.json();
  if (!Array.isArray(countries)) throw new Error('Invalid country list');
  const selected = countries.find(item => item && typeof item.name === 'string' && item.name.toLowerCase() === country.toLowerCase());
  if (!selected || !Number.isInteger(selected.id)) throw new Error('Country unavailable');
  const params = new URLSearchParams({ 'filters[country_id]': String(selected.id), 'filters[servers_technologies][identifier]': 'openvpn_udp', limit: '3' });
  const response = await request(`https://api.nordvpn.com/v1/servers/recommendations?${params}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Server lookup failed');
  const servers: unknown = await response.json();
  if (!Array.isArray(servers)) throw new Error('Invalid server list');
  const server = servers.find(item => item && item.status === 'online' && typeof item.station === 'string' && isIP(item.station) === 4
    && typeof item.hostname === 'string' && /^[a-z]{2}\d+\.nordvpn\.com$/.test(item.hostname)
    && Array.isArray(item.locations) && item.locations.some((location: { country?: { id?: number } }) => location.country?.id === selected.id));
  if (!server) throw new Error('No online server for this country');
  return { address: server.station, hostname: server.hostname };
}
