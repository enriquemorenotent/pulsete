import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { ServerResponse } from 'node:http';

const distRoot = join(process.cwd(), 'dist');
const publicRoot = process.cwd();

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

export const serveStatic = async (pathname: string, res: ServerResponse) => {
  if (pathname === '/' || pathname === '/index.html') {
    return serveIndex(res);
  }
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [join(distRoot, safePath), join(publicRoot, safePath)]) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        res.setHeader('Content-Type', mimeTypes[extname(candidate)] ?? 'application/octet-stream');
        res.end(await readFile(candidate));
        return;
      }
    } catch {
      // continue
    }
  }
  await serveIndex(res);
};

const serveIndex = async (res: ServerResponse) => {
  const content = await readFile(join(distRoot, 'index.html')).catch(() => readFile(join(publicRoot, 'index.html')));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(content);
};
