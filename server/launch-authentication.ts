import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { launchBootstrapFragmentKey } from '../shared/launch-authentication.js';

export const launchSessionCookieName = 'pulsete_launch';

export type LaunchSessionCookie = Readonly<{
  name: string;
  value: string;
}>;

export type LaunchAuthentication = {
  authenticate(req: Pick<IncomingMessage, 'headers'>): boolean;
  consumeBootstrapToken(token: string): boolean;
  createBrowserBootstrapUrl(browserOrigin: string): string;
  createSetCookieHeader(): string;
  expire(): void;
  getSessionCookie(): LaunchSessionCookie;
};

type LaunchAuthenticationOptions = {
  bootstrapToken?: string;
  credential?: string;
};

export const createLaunchAuthentication = (
  options: LaunchAuthenticationOptions = {},
): LaunchAuthentication => {
  let credential = options.credential ?? createSecret();
  let bootstrapToken: string | null = options.bootstrapToken ?? createSecret();
  let active = true;

  const requireActiveCredential = () => {
    if (!active) {
      throw new Error('Launch authentication has expired');
    }
    return credential;
  };

  return {
    authenticate(req) {
      if (!active) {
        return false;
      }
      const supplied = readCookie(req.headers.cookie, launchSessionCookieName);
      return supplied !== null && secretsMatch(supplied, credential);
    },
    consumeBootstrapToken(token) {
      if (!active || bootstrapToken === null || !secretsMatch(token, bootstrapToken)) {
        return false;
      }
      bootstrapToken = null;
      return true;
    },
    createBrowserBootstrapUrl(browserOrigin) {
      if (!active || bootstrapToken === null) {
        throw new Error('Browser bootstrap is no longer available');
      }
      const url = createLocalBrowserUrl(browserOrigin);
      url.hash = new URLSearchParams({
        [launchBootstrapFragmentKey]: bootstrapToken,
      }).toString();
      return url.toString();
    },
    createSetCookieHeader() {
      return [
        `${launchSessionCookieName}=${requireActiveCredential()}`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/',
      ].join('; ');
    },
    expire() {
      active = false;
      credential = '';
      bootstrapToken = null;
    },
    getSessionCookie() {
      return {
        name: launchSessionCookieName,
        value: requireActiveCredential(),
      };
    },
  };
};

const createSecret = () => randomBytes(32).toString('base64url');

const createLocalBrowserUrl = (browserOrigin: string) => {
  const parsed = new URL(browserOrigin);
  const isLoopback = parsed.hostname === '127.0.0.1'
    || parsed.hostname === 'localhost'
    || parsed.hostname === '[::1]';
  if (
    parsed.protocol !== 'http:'
    || !isLoopback
    || parsed.username
    || parsed.password
    || (browserOrigin !== parsed.origin && browserOrigin !== `${parsed.origin}/`)
  ) {
    throw new Error('Browser bootstrap origin must be an exact local HTTP origin');
  }
  return new URL('/', parsed.origin);
};

const secretsMatch = (supplied: string, expected: string) => {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
};

const readCookie = (header: string | undefined, name: string) => {
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator > 0 && trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1);
    }
  }
  return null;
};
