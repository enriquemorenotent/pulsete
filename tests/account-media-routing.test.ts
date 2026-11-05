import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { createServer } from 'node:http';
import { registerAccountMediaRoute, getAccountMediaRoute } from '../server/account-media-route.js';
import { createAccountMediaNetwork, requestAccountResource } from '../server/account-media-network.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { listen, requestJson } from './helpers/http-request-helpers.js';
import { createNetworkInput } from './helpers/runtime-test-common.js';

// Fake VPN exits forward public destinations to a controlled local website.
// Different loopback source addresses let the site observe the chosen exit.
test('media and previews use their account exit, isolate caches, and fail closed after disconnect', async () => {
  const visits: { source: string; path: string; cookie?: string; referer?: string }[] = [];
  const website = createServer((req, res) => {
    visits.push({ source: req.socket.remoteAddress!, path: req.url!, cookie: req.headers.cookie, referer: req.headers.referer });
    if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://127.0.0.1/private' }); res.end(); }
    else if (req.url === '/page') { res.setHeader('Content-Type', 'text/html'); res.end('<meta property="og:image" content="http://1.1.1.1/image.png">'); }
    else if (req.url === '/unsafe.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg/>'); }
    else { res.setHeader('Content-Type', 'image/png'); res.setHeader('Set-Cookie', 'tracker=1'); res.end('image'); }
  });
  const port = await listen(website);
  const context = await createHttpRuntimeContext();
  const controllers = [new AbortController(), new AbortController()];
  const accounts = ['Germany','Austria'].map((country, i) => {
    const account = context.storage.networks.upsert(createNetworkInput({ name: country, nordVpnUsername: 'dummy', nordVpnPassword: 'dummy', nordVpnLocation: `country:${country}` }));
    registerAccountMediaRoute(account.id, {
      location: `country:${country}`, signal: controllers[i]!.signal,
      connect: async (host, targetPort) => {
        assert.equal(host, '1.1.1.1'); assert.equal(targetPort, 80);
        return net.connect({ host: '127.0.0.1', port, localAddress: `127.0.0.${i + 2}` });
      },
    });
    return account;
  });
  const resource = (id: string | undefined, url = 'http://1.1.1.1/image.png') => `http://127.0.0.1:${context.port}/api/media/resource?${new URLSearchParams({ ...(id ? { networkId: id } : {}), url })}`;
  try {
    for (const account of accounts) {
      const response = await fetch(resource(account.id), { headers: { Cookie: 'local-session=secret', Referer: 'http://localhost/private' } });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'image');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      const preview = await requestJson(context.port, 'POST', '/api/media/page-preview', { networkId: account.id, url: 'http://1.1.1.1/page' });
      assert.equal(preview.status, 200); assert.ok(preview.json.preview);
    }
    assert.deepEqual(visits.map(v => v.source), ['127.0.0.2','127.0.0.2','127.0.0.3','127.0.0.3']);
    assert.ok(visits.every(v => !v.cookie && !v.referer));
    assert.equal((await fetch(resource(accounts[0]!.id, 'http://1.1.1.1/redirect'))).status, 400);
    assert.equal((await fetch(resource(accounts[0]!.id, 'http://1.1.1.1/unsafe.svg'))).status, 400);
    const count = visits.length;
    controllers[0]!.abort();
    assert.equal((await fetch(resource(accounts[0]!.id))).status, 400);
    assert.equal((await fetch(resource(undefined))).status, 400);
    const cachedPreview = await requestJson(context.port, 'POST', '/api/media/page-preview', { networkId: accounts[0]!.id, url: 'http://1.1.1.1/page' });
    assert.equal(cachedPreview.status, 400);
    assert.equal(visits.length, count);
    assert.equal((await fetch(resource(accounts[1]!.id))).status, 200);
  } finally {
    controllers.forEach(controller => controller.abort());
    await context.close();
    website.closeAllConnections();
    await new Promise<void>(resolve => website.close(() => resolve()));
  }
});

test('a stopped route cannot fall back to host DNS or a direct socket', async () => {
  const controller = new AbortController();
  let calls = 0;
  const route = { location: 'country:Germany', signal: controller.signal, connect: async () => { calls++; throw Error('proxy down'); } };
  registerAccountMediaRoute('offline-test', route);
  await assert.rejects(createAccountMediaNetwork(route).resolve('example.com'), /proxy down/);
  controller.abort();
  assert.throws(() => getAccountMediaRoute('offline-test', route.location), /Connect/);
  await assert.rejects(requestAccountResource(new URL('http://1.1.1.1'), {address:'1.1.1.1',family:4}, {maxBytes:100,timeoutMs:100}, route));
  assert.equal(calls, 2); // Both DNS record requests went through the failed VPN route.
});

test('media download is aborted when its VPN disconnects', async () => {
  const website = createServer((_req, _res) => {});
  const port = await listen(website);
  const controller = new AbortController();
  const route = { location: 'country:Germany', signal: controller.signal, connect: async () => net.connect(port,'127.0.0.1') };
  const pending = requestAccountResource(new URL('http://1.1.1.1'), {address:'1.1.1.1',family:4}, {maxBytes:100,timeoutMs:5000}, route);
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending);
  website.closeAllConnections();
  await new Promise<void>(resolve => website.close(() => resolve()));
});

test('account pictures stay available offline, refresh through the VPN, and remain account scoped', async () => {
  let visits = 0;
  const website = createServer((_req, res) => {
    visits++;
    res.setHeader('Content-Type', 'image/png');
    res.end(`picture-${visits}`);
  });
  const port = await listen(website);
  const context = await createHttpRuntimeContext();
  const controller = new AbortController();
  const sourceUrl = 'http://1.1.1.1/account.png';
  const input = createNetworkInput({ iconUrl: sourceUrl, nordVpnUsername: 'dummy', nordVpnPassword: 'dummy', nordVpnLocation: 'country:Germany' });
  const account = context.storage.networks.upsert(input);
  const other = context.storage.networks.upsert({ ...input, name: 'Other account' });
  const resource = (id = account.id, url = sourceUrl) =>
    `http://127.0.0.1:${context.port}/api/media/resource?${new URLSearchParams({ networkId: id, url })}`;
  const expire = async () => {
    const { openSqliteDatabase } = await import('../server/storage-sqlite.js');
    const db = openSqliteDatabase(context.storage.databasePath);
    try { db.prepare('UPDATE account_images SET updatedAt = 0').run(); }
    finally { db.close(); }
  };
  try {
    assert.equal((await fetch(resource())).status, 400);
    assert.equal(visits, 0);
    registerAccountMediaRoute(account.id, {
      location: input.nordVpnLocation!, signal: controller.signal,
      connect: async () => net.connect(port, '127.0.0.1'),
    });
    const first = await fetch(resource());
    assert.equal(first.status, 200);
    assert.equal(await first.text(), 'picture-1');
    assert.equal(await (await fetch(resource())).text(), 'picture-1');
    assert.equal(visits, 1);
    await expire();
    assert.equal(await (await fetch(resource())).text(), 'picture-2');
    assert.equal(visits, 2);
    controller.abort();
    await expire();
    const offline = await fetch(resource());
    assert.equal(offline.status, 200);
    assert.equal(offline.headers.get('content-type'), 'image/png');
    assert.equal(await offline.text(), 'picture-2');
    assert.equal((await fetch(resource(other.id))).status, 400);
    assert.equal((await fetch(resource(account.id, 'http://1.1.1.1/unrelated.png'))).status, 400);
    context.storage.networks.upsert({ ...input, id: account.id, iconUrl: 'http://1.1.1.1/new.png' });
    assert.equal((await fetch(resource())).status, 400);
    assert.equal((await fetch(resource(account.id, 'http://1.1.1.1/new.png'))).status, 400);
    assert.equal(visits, 2);
  } finally {
    controller.abort();
    await context.close();
    website.closeAllConnections();
    await new Promise<void>(resolve => website.close(() => resolve()));
  }
  const { Storage } = await import('../server/storage.js');
  const reopened = new Storage(context.storage.databasePath);
  try {
    assert.equal(reopened.networks.getAccountImage(account.id, sourceUrl)?.imageData.toString(), 'picture-2');
    assert.equal(reopened.networks.getAccountImage(other.id, sourceUrl), undefined);
    reopened.networks.delete(account.id);
    assert.equal(reopened.networks.getAccountImage(account.id, sourceUrl), undefined);
  } finally { reopened.close(); }
});

test('saved IRCCloud account pictures are available offline only for the current identity', async () => {
  const context = await createHttpRuntimeContext();
  const sourceUrl = 'https://static.irccloud-cdn.com/avatar-redirect/7';
  const input = createNetworkInput({ username: 'uid7', nordVpnUsername: 'dummy', nordVpnPassword: 'dummy', nordVpnLocation: 'country:Germany' });
  const account = context.storage.networks.upsert(input);
  context.storage.networks.saveAccountImage(account.id, sourceUrl, 'image/png', Buffer.from('saved-avatar'));
  const resource = `http://127.0.0.1:${context.port}/api/media/resource?${new URLSearchParams({ networkId: account.id, url: sourceUrl })}`;
  try {
    const response = await fetch(resource);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'saved-avatar');
    context.storage.networks.upsert({ ...input, id: account.id, username: 'uid8' });
    assert.equal((await fetch(resource)).status, 400);
  } finally { await context.close(); }
});
