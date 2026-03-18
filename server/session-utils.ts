import type { IncomingMessage } from 'node:http';
import type { AppSnapshot } from '../shared/protocol.js';
import { unauthorized } from './app-error.js';
import { cookieName, parseCookies } from './http-utils.js';
import type { Session } from './http-types.js';
import type { Storage } from './storage.js';

export type SessionResult =
  | { bootstrapped: false; authenticated: false }
  | { bootstrapped: true; authenticated: false }
  | { bootstrapped: true; authenticated: true; user: { id: string; username: string }; snapshot: AppSnapshot };

export const getSessionTokenFromRequest = (req: IncomingMessage) =>
  parseCookies(req.headers.cookie)[cookieName] ?? null;

export const getSessionFromRequest = (storage: Storage, req: IncomingMessage): Session => {
  const token = getSessionTokenFromRequest(req);
  return token ? storage.getSession(token) : null;
};

export const requireLiveSessionFromRequest = (storage: Storage, req: IncomingMessage, userId?: string) => {
  const session = getSessionFromRequest(storage, req);
  if (!session || (userId && session.user.id !== userId)) {
    throw unauthorized('Authentication required');
  }
  return session;
};

export const sessionResponse = (storage: Storage, session: Session): SessionResult => {
  if (!storage.hasUsers()) {
    return { bootstrapped: false, authenticated: false };
  }
  if (!session) {
    return { bootstrapped: true, authenticated: false };
  }
  return {
    bootstrapped: true,
    authenticated: true,
    user: session.user,
    snapshot: storage.snapshot(session.user.id),
  };
};
