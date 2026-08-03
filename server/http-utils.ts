import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, payloadTooLarge, unsupportedMediaType } from './app-error.js';

export const jsonBodyLimitBytes = 64 * 1024;
export const networkJsonBodyLimitBytes = 8 * 1024 * 1024;
export const backupBodyLimitBytes = 512 * 1024 * 1024;
const requestBase = 'http://127.0.0.1';

export const readJson = async (req: IncomingMessage, maxBytes = jsonBodyLimitBytes) => {
  if (!isJsonContentType(req.headers['content-type'])) {
    throw unsupportedMediaType('Content-Type must be application/json');
  }
  const raw = await readBytes(req, maxBytes);
  return raw.length > 0 ? JSON.parse(raw.toString('utf8')) : {};
};

const isJsonContentType = (value: string | undefined) =>
  value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

export const readBytes = async (req: IncomingMessage, maxBytes: number) => {
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw payloadTooLarge('Request body too large');
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw payloadTooLarge('Request body too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

export const writeJson = (res: ServerResponse, status: number, payload: unknown, cookie?: string) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }
  res.end(JSON.stringify(payload));
};

export const tryParseRequestUrl = (value: string | undefined) => {
  try {
    return new URL(value ?? '/', requestBase);
  } catch {
    return null;
  }
};

export const parseRequestUrl = (value: string | undefined) => {
  const url = tryParseRequestUrl(value);
  if (!url) {
    throw badRequest('Invalid request target');
  }
  return url;
};

export const decodeRouteParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw badRequest('Invalid request parameter');
  }
};

export const isApi = (pathname: string) => pathname.startsWith('/api/');
export const isApiRequest = (value: string | undefined) => {
  if (typeof value === 'string' && value.startsWith('/api/')) {
    return true;
  }
  return isApi(tryParseRequestUrl(value)?.pathname ?? '');
};
