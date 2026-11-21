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
    else if (req.url === '/loop') { res.writeHead(302, { Location: '/loop#fragment' }); res.end(); }
    else if (req.url === '/page') { res.setHeader('Content-Type', 'text/html'); res.end('<meta property="og:image" content="http://1.1.1.1/image.png">'); }
    else if (req.url === '/unsafe.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg/>'); }
    else if (req.url === '/animation.gif') { res.setHeader('Content-Type', 'image/gif'); res.end(String(visits.length)); }
    else if (req.url === '/video.mp4') { res.setHeader('Content-Type', 'video/mp4'); res.end(String(visits.length)); }
    else { res.setHeader('Content-Type', 'image/png'); res.setHeader('Set-Cookie', 'tracker=1'); res.end('image'); }
  });
  const port = await listen(website);
  const context = await createHttpRuntimeContext();
  const controllers = [new AbortController(), new AbortController()];
  const reconnected = new AbortController();
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
  const resource = (id: string | undefined, url = 'http://1.1.1.1/image.png', looping = false) => {
    const query = new URLSearchParams({ ...(id ? { networkId: id } : {}), url });
    if (looping) query.set('loopingPreview', '1');
    return `http://127.0.0.1:${context.port}/api/media/resource?${query}`;
  };
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
    const [first, second] = accounts;
    const gif = 'http://1.1.1.1/animation.gif';
    const video = 'http://1.1.1.1/video.mp4';
    const mediaBody = async (id: string, url: string, looping = false) => {
      const response = await fetch(resource(id, url, looping));
      assert.equal(response.status, 200);
      return response.text();
    };
    assert.equal(await mediaBody(first!.id, 'http://1.1.1.1/image.png'), 'image');
    assert.equal(visits.length, 4);
    const firstGif = await mediaBody(first!.id, gif);
    assert.equal(await mediaBody(first!.id, gif), firstGif);
    assert.notEqual(await mediaBody(second!.id, gif), firstGif);
    assert.notEqual(await mediaBody(first!.id, video), await mediaBody(first!.id, video));
    const firstClip = await mediaBody(first!.id, video, true);
    assert.equal(await mediaBody(first!.id, video, true), firstClip);
    assert.notEqual(await mediaBody(first!.id, video), firstClip);
    assert.notEqual(await mediaBody(second!.id, video, true), firstClip);
    assert.equal((await fetch(resource(accounts[0]!.id, 'http://1.1.1.1/redirect'))).status, 400);
    assert.equal((await fetch(resource(accounts[0]!.id, 'http://1.1.1.1/unsafe.svg'))).status, 400);
    const beforeLoop = visits.length;
    assert.equal((await fetch(resource(accounts[0]!.id, 'http://1.1.1.1/loop'))).status, 400);
    assert.equal(visits.length, beforeLoop + 1);
    const count = visits.length;
    controllers[0]!.abort();
    assert.equal((await fetch(resource(accounts[0]!.id))).status, 400);
    assert.equal((await fetch(resource(first!.id, video, true))).status, 400);
    assert.equal((await fetch(resource(undefined))).status, 400);
    const cachedPreview = await requestJson(context.port, 'POST', '/api/media/page-preview', { networkId: accounts[0]!.id, url: 'http://1.1.1.1/page' });
    assert.equal(cachedPreview.status, 400);
    assert.equal(visits.length, count);
    assert.equal((await fetch(resource(accounts[1]!.id))).status, 200);
    registerAccountMediaRoute(first!.id, {
      location: 'country:Germany', signal: reconnected.signal,
      connect: async () => net.connect(port, '127.0.0.1'),
    });
    assert.notEqual(await mediaBody(first!.id, gif), firstGif);
    assert.notEqual(await mediaBody(first!.id, video, true), firstClip);
  } finally {
    controllers.forEach(controller => controller.abort());
    reconnected.abort();
    await context.close();
    website.closeAllConnections();
    await new Promise<void>(resolve => website.close(() => resolve()));
  }
});

test('inline image and looping video reuse follows origin freshness and redirect cache instructions', async (t) => {
  const start = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now: start });
  const policies: Record<string, Record<string, string>> = {
    '/no-store': { 'Cache-Control': 'max-age=60, No-Store' },
    '/no-cache': { 'Cache-Control': 'no-cache="field, other", max-age=60' },
    '/zero': { 'Cache-Control': 'max-age=0' },
    '/private': { 'Cache-Control': 'private, max-age=60' },
    '/vary-all': { Vary: '*' },
    '/must-revalidate': { 'Cache-Control': 'must-revalidate, max-age=2' },
    '/aged': { 'Cache-Control': 'max-age=6', Age: '4' },
    '/expires': { Expires: new Date(start + 2000).toUTCString() },
    '/long-lived': { 'Cache-Control': 'max-age=3600' },
    '/redirect': { 'Cache-Control': 'no-store', Location: '/long-lived' },
    '/uncacheable.mp4': { 'Cache-Control': 'no-store' },
    '/expiring.mp4': { 'Cache-Control': 'max-age=2' },
  };
  let visits = 0;
  const website = createServer((req, res) => {
    const path = req.url!;
    res.writeHead(path === '/redirect' ? 302 : 200, {
      'Content-Type': path.endsWith('.mp4') ? 'video/mp4' : 'image/gif',
      Date: new Date().toUTCString(), ...policies[path],
    });
    res.end(String(++visits));
  });
  const port = await listen(website);
  const context = await createHttpRuntimeContext();
  const controller = new AbortController();
  const location = 'country:Germany';
  const account = context.storage.networks.upsert(createNetworkInput({
    nordVpnUsername: 'dummy', nordVpnPassword: 'dummy', nordVpnLocation: location,
  }));
  registerAccountMediaRoute(account.id, {
    location, signal: controller.signal, connect: async () => net.connect(port, '127.0.0.1'),
  });
  const load = async (path: string) => {
    const query = new URLSearchParams({ networkId: account.id, url: `http://1.1.1.1${path}` });
    if (path.endsWith('.mp4')) query.set('loopingPreview', '1');
    const response = await fetch(`http://127.0.0.1:${context.port}/api/media/resource?${query}`);
    assert.equal(response.status, 200);
    return response.text();
  };
  try {
    for (const path of ['/no-store', '/no-cache', '/zero', '/private', '/vary-all', '/redirect', '/uncacheable.mp4']) {
      assert.notEqual(await load(path), await load(path), path);
    }
    const concurrent = await Promise.all([load('/no-store'), load('/no-store')]);
    assert.notEqual(concurrent[0], concurrent[1]);
    const expiring = ['/must-revalidate', '/aged', '/expires', '/expiring.mp4'];
    const first = await Promise.all(expiring.map(load));
    const longLived = await load('/long-lived');
    t.mock.timers.tick(1999);
    assert.deepEqual(await Promise.all(expiring.map(load)), first);
    t.mock.timers.tick(1);
    for (const [index, path] of expiring.entries()) assert.notEqual(await load(path), first[index], path);
    assert.equal(await load('/long-lived'), longLived);
    t.mock.timers.tick(5 * 60 * 1000);
    assert.notEqual(await load('/long-lived'), longLived);
  } finally {
    controller.abort();
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
