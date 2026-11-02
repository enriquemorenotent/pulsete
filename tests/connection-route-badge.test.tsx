import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectionRouteBadge } from '../web/src/ConnectionRouteBadge.js';
import { makeSidebarNetwork } from './helpers/connection-sidebar-test-helpers.js';

for (const phase of ['connected', 'connecting', 'offline'] as const) test(`VPN badge accurately labels ${phase} connections`, () => {
 const markup = renderToStaticMarkup(<ConnectionRouteBadge network={{ ...makeSidebarNetwork(), nordVpnLocation: 'country:Netherlands' }} phase={phase} />);
 assert.match(markup, /NordVPN tunnel · Netherlands/);
 assert.ok(markup.includes("🇳🇱"));
 assert.ok(markup.includes(phase === 'connected' ? 'Connected' : phase === 'connecting' ? 'Connecting' : 'Configured, offline'));
 assert.ok(markup.includes(phase === 'connected' ? 'text-emerald-300' : phase === 'connecting' ? 'text-amber-300' : 'text-muted-foreground'));
 if (phase !== 'connected') assert.match(markup, />VPN<\/span>/);
});
test('SOCKS5 routes are identified as proxies rather than VPN tunnels', () => {
 const markup = renderToStaticMarkup(<ConnectionRouteBadge network={{ ...makeSidebarNetwork(), nordVpnLocation: 'amsterdam' }} phase="connected" />);
 assert.match(markup, /NordVPN SOCKS5 proxy · Amsterdam, Netherlands/);
 assert.match(markup, />Proxy</);
 assert.ok(markup.includes("🇳🇱"));
 assert.doesNotMatch(markup, /NordVPN tunnel/);
});
test('direct connections have no VPN indicator', () => {
 assert.equal(renderToStaticMarkup(<ConnectionRouteBadge network={makeSidebarNetwork()} phase="connected" />), '');
});

test('VPN badge shows the selected server number and full hostname on hover', () => {
 const network = { ...makeSidebarNetwork(), nordVpnLocation: 'country:Germany' };
 const markup = renderToStaticMarkup(<ConnectionRouteBadge network={network} phase="connected" vpnServer="de1566.nordvpn.com" />);
 assert.match(markup, /VPN #1566/);
 assert.match(markup, /title="NordVPN tunnel · Germany · de1566.nordvpn.com · Connected"/);
 const offline = renderToStaticMarkup(<ConnectionRouteBadge network={network} phase="offline" vpnServer="de1566.nordvpn.com" />);
 assert.doesNotMatch(offline, /1566/);
 const pending = renderToStaticMarkup(<ConnectionRouteBadge network={network} phase="connecting" />);
 assert.doesNotMatch(pending, /#/);
});
