import type { IncomingMessage, ServerResponse } from 'node:http';

export const cookieName = 'pulsete_session';

export const parseCookies = (header: string | undefined) =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
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

export const isApi = (pathname: string) => pathname.startsWith('/api/');
export const isChannelTarget = (value: string) => /^[#&+!]/.test(value);
