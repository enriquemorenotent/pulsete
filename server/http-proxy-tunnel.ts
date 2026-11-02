import net from 'node:net';

export function connectHttpTunnel(socket: net.Socket, proxy: { port: number; username: string; password: string }, destination: { host: string; port: number }, signal: AbortSignal): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let header = Buffer.alloc(0);
    const timer = setTimeout(() => fail(new Error('VPN proxy timed out')), 15_000);
    timer.unref();
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('data', data);
      socket.off('error', fail);
      socket.off('close', closed);
      signal.removeEventListener('abort', aborted);
    };
    const fail = (error: Error) => { cleanup(); socket.destroy(); reject(error); };
    const closed = () => fail(new Error('VPN proxy closed the connection'));
    const aborted = () => fail(new Error('VPN connection canceled'));
    const data = (chunk: Buffer) => {
      header = Buffer.concat([header, chunk]);
      if (header.length > 16_384) { fail(new Error('Invalid VPN proxy response')); return; }
      const end = header.indexOf('\r\n\r\n');
      if (end === -1) return;
      if (!/^HTTP\/1\.[01] 200(?: |\r)/.test(header.toString('latin1'))) { fail(new Error('VPN proxy refused the connection')); return; }
      socket.pause();
      cleanup();
      const extra = header.subarray(end + 4);
      if (extra.length) socket.unshift(extra);
      resolve(socket);
    };
    socket.on('error', fail);
    socket.on('close', closed);
    socket.on('data', data);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    const host = destination.host;
    if (!host || /[\s\r\n]/.test(host) || !Number.isInteger(destination.port) || destination.port < 1 || destination.port > 65535) { fail(new Error('Invalid IRC destination')); return; }
    const authority = `${net.isIP(host) === 6 ? `[${host}]` : host}:${destination.port}`;
    const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64');
    socket.connect({ host: '127.0.0.1', port: proxy.port }, () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`);
    });
  });
}
