import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const sessionCookieName = 'pulsete-session';
export const clientBootstrapHeader = 'x-pulsete-bootstrap';
export const clientBootstrapPath = '/api/client-auth';

export type ClientAuthentication = {
  authenticate: (request: IncomingMessage) => boolean;
  bootstrap: (request: IncomingMessage, response: ServerResponse) => boolean;
  bootstrapCredential: string;
};

export const createClientAuthentication = (): ClientAuthentication => {
  const sessionCredential = createCredential();
  const bootstrapCredential = createCredential();
  let bootstrapAvailable = true;

  return {
    bootstrapCredential,
    authenticate: (request) => credentialsMatch(
      readCookie(request.headers.cookie, sessionCookieName),
      sessionCredential,
    ),
    bootstrap: (request, response) => {
      const supplied = readSingleHeader(request.headers[clientBootstrapHeader]);
      if (!bootstrapAvailable || !credentialsMatch(supplied, bootstrapCredential)) {
        return false;
      }
      bootstrapAvailable = false;
      response.setHeader(
        'Set-Cookie',
        `${sessionCookieName}=${sessionCredential}; HttpOnly; SameSite=Strict; Path=/`,
      );
      return true;
    },
  };
};

export const createClientBootstrapUrl = (origin: string, credential: string) => {
  const url = new URL(origin);
  url.hash = new URLSearchParams({ 'pulsete-bootstrap': credential }).toString();
  return url.toString();
};

const createCredential = () => randomBytes(32).toString('base64url');

const credentialsMatch = (supplied: string | null, expected: string) => {
  if (!supplied) {
    return false;
  }
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
};

const readSingleHeader = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : null;

const readCookie = (header: string | undefined, name: string) => {
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    return part.slice(separator + 1).trim();
  }
  return null;
};
