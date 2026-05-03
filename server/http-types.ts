import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';
import type { RuntimeHttpApi } from './runtime.js';
import type { BrowserPreferences, StorageBackupDownload } from './storage-backup.js';

export type BackupHttpApi = {
  export(browserPreferences: BrowserPreferences): StorageBackupDownload;
  import(backupContent: Buffer): { browserPreferences: BrowserPreferences };
};

export type HttpContext = RuntimeHttpApi & { backups: BackupHttpApi };

export type HttpHandlerContext = RuntimeHttpApi | HttpContext;

export type RouteArgs = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
  context: RuntimeHttpApi;
};

export type BackupRouteArgs = Omit<RouteArgs, 'context'> & { context: HttpContext };
