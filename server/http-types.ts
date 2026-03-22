import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { RuntimeHttpApi } from './runtime.js';

export type HttpContext = RuntimeHttpApi;

export type RouteArgs = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  context: HttpContext;
};
