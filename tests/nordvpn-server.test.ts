import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNordVpnEndpoint } from '../server/nordvpn-server.js';

test('VPN endpoint comes from current NordVPN recommendations for the requested country', async () => {
 const urls: string[] = [];
 const request = (async (url: string | URL | Request) => {
  urls.push(String(url));
  return Response.json(urls.length === 1 ? [{id:81,name:'Germany'}] : [
   {status:'online',hostname:'nl1234.nordvpn.com',station:'192.0.2.2',locations:[{country:{id:108}}]},
   {status:'online',hostname:'de1566.nordvpn.com',station:'192.0.2.1',locations:[{country:{id:81}}]},
  ]);
 }) as typeof fetch;
 assert.deepEqual(await resolveNordVpnEndpoint('Germany',request),{ address: '192.0.2.1', hostname: 'de1566.nordvpn.com' });
 assert.match(decodeURIComponent(urls[1]!),/filters\[country_id\]=81/);
 assert.match(urls[1]!,/openvpn_udp/);
});

test('unavailable recommendations do not fall back to stale endpoints', async () => {
 let call=0;
 const request=(async()=>Response.json(++call===1 ? [{id:81,name:'Germany'}] : [])) as typeof fetch;
 await assert.rejects(resolveNordVpnEndpoint('Germany',request),/No online server/);
});
