import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { Runtime } from './runtime.js';
import type { Storage } from './storage.js';

export type HttpContext = {
  runtime: Runtime;
  storage: Storage;
};

export type Session = ReturnType<Storage['getSession']>;

export type RouteArgs = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  context: HttpContext;
  session: Session;
};
