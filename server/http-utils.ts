import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest } from './app-error.js';

export const cookieName = 'pulsete_session';
const requestBase = 'http://127.0.0.1';
const decodeCookieValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseCookies = (header: string | undefined) =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeCookieValue(part.slice(index + 1))];
      })
  );

export const readJson = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.length > 0 ? JSON.parse(raw) : {};
};

export const writeJson = (res: ServerResponse, status: number, payload: unknown, cookie?: string) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }
  res.end(JSON.stringify(payload));
};

export const setSessionCookie = (token: string) =>
  `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`;

export const clearSessionCookie = () =>
  `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;

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
export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
