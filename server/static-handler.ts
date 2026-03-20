import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { ServerResponse } from 'node:http';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

type StaticHandlerOptions = {
  assetRoot?: string;
};

export const serveStatic = async (pathname: string, res: ServerResponse, options: StaticHandlerOptions = {}) => {
  const assetRoot = resolveAssetRoot(options.assetRoot);
  if (pathname === '/' || pathname === '/index.html') {
    return serveIndex(res, assetRoot);
  }
  const candidate = resolveStaticCandidate(pathname, assetRoot);
  if (candidate) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) {
        res.setHeader('Content-Type', mimeTypes[extname(candidate)] ?? 'application/octet-stream');
        res.end(await readFile(candidate));
        return;
      }
    } catch {
      // fall through
    }
  }
  if (extname(pathname)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  await serveIndex(res, assetRoot);
};

const serveIndex = async (res: ServerResponse, assetRoot: string) => {
  try {
    const content = await readFile(resolve(assetRoot, 'index.html'));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(content);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Built assets not found. Run `npm run build` before starting the server.');
  }
};

const resolveAssetRoot = (assetRoot?: string) => resolve(assetRoot ?? resolve(process.cwd(), 'dist'));

const resolveStaticCandidate = (pathname: string, assetRoot: string) => {
  const candidate = resolve(assetRoot, `.${pathname}`);
  if (candidate === assetRoot || candidate.startsWith(`${assetRoot}${sep}`)) {
    return candidate;
  }
  return null;
};
