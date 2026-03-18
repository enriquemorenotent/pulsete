import type { IncomingMessage } from 'node:http';
import type { AppSnapshot } from '../shared/protocol.js';
import { cookieName, parseCookies } from './http-utils.js';
import type { Session } from './http-types.js';
import type { Storage } from './storage.js';

export type SessionResult =
  | { bootstrapped: false; authenticated: false }
  | { bootstrapped: true; authenticated: false }
  | { bootstrapped: true; authenticated: true; user: { id: string; username: string }; snapshot: AppSnapshot };

export const getSessionFromRequest = (storage: Storage, req: IncomingMessage): Session => {
  const token = parseCookies(req.headers.cookie)[cookieName];
  return token ? storage.getSession(token) : null;
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
