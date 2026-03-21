import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';

export const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      resolve(address.port);
    });
  });

export const requestJson = async (
  port: number,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
) => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json() as Record<string, unknown>,
  };
};

export const sendRawRequest = (port: number, rawRequest: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(rawRequest));
    let data = '';
    let settled = false;
    const resolveOnce = () => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };
    const rejectOnce = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', resolveOnce);
    socket.on('close', resolveOnce);
    socket.on('error', rejectOnce);
    socket.setTimeout(500, () => socket.destroy(new Error('Timed out waiting for response')));
  });
