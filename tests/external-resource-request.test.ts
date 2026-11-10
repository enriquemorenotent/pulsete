import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { requestExternalResource } from '../server/external-resource-request.js';
import { listen } from './helpers/http-request-helpers.js';

for (const routed of [false, true]) {
  test(`shared downloader enforces size, timeout, and cleanup rules (${routed ? 'routed' : 'direct'})`, async () => {
    const website = createServer((req, res) => {
      if (req.url === '/declared') { res.writeHead(200, { 'Content-Length': '1000' }); res.flushHeaders(); }
      else if (req.url === '/chunked') { res.writeHead(200); res.write('12345'); res.end('67890'); }
      else if (req.url === '/stall') { res.writeHead(200); res.flushHeaders(); }
      else if (req.url === '/truncated') { res.writeHead(200, { 'Content-Length': '5' }); res.write('a'); setImmediate(() => res.destroy()); }
      else if (req.url === '/image') { res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '1000' }); res.flushHeaders(); }
      else { res.setHeader('Content-Type', 'text/plain'); res.end('hello'); }
    });
    const port = await listen(website);
    const controller = new AbortController();
    const sockets: net.Socket[] = [];
    const route = routed ? { signal: controller.signal, connect: async (host: string, targetPort: number) => {
      assert.equal(host, '1.1.1.1'); assert.equal(targetPort, 80);
      const socket = net.connect({ host: '127.0.0.1', port });
      sockets.push(socket);
      return socket;
    } } : undefined;
    const read = (path: string, headersOnlyForImages = false) => requestExternalResource(
      new URL(routed ? `http://example.com${path}` : `http://127.0.0.1:${port}${path}`),
      { address: routed ? '1.1.1.1' : '127.0.0.1', family: 4 },
      { maxBytes: 5, timeoutMs: 100, route, headersOnlyForImages },
    );
    try {
      assert.equal((await read('/ok')).body.toString(), 'hello');
      await assert.rejects(read('/declared'), /too large/);
      await assert.rejects(read('/chunked'), /too large/);
      await assert.rejects(read('/truncated'), /ended early|aborted/);
      await assert.rejects(read('/stall'), /abort|timed out/i);
      const image = await read('/image', true);
      assert.equal(image.contentType, 'image/png');
      assert.equal(image.body.length, 0);
      await assert.rejects(read('/image'), /too large/);
      assert.ok(sockets.every(socket => socket.destroyed));
    } finally {
      controller.abort();
      website.closeAllConnections();
      await new Promise<void>(resolve => website.close(() => resolve()));
    }
  });
}

test('a stalled VPN connection times out and a socket arriving later is destroyed', async () => {
  const website = createServer();
  const port = await listen(website);
  let connected!: (socket: net.Socket) => void;
  const route = { signal: new AbortController().signal, connect: () => new Promise<net.Socket>(resolve => { connected = resolve; }) };
  try {
    await assert.rejects(requestExternalResource(new URL('http://example.com'), { address: '1.1.1.1', family: 4 },
      { maxBytes: 5, timeoutMs: 20, route }), /timed out/);
    const socket = net.connect({ host: '127.0.0.1', port });
    connected(socket);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(socket.destroyed, true);
  } finally {
    website.closeAllConnections();
    await new Promise<void>(resolve => website.close(() => resolve()));
  }
});
