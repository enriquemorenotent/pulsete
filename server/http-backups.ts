import { z } from 'zod';
import type { ServerResponse } from 'node:http';
import { badRequest } from './app-error.js';
import {
  backupBodyLimitBytes,
  readBytes,
  readJson,
  writeJson,
} from './http-utils.js';
import type { BackupRouteArgs } from './http-types.js';
import type { BrowserPreferences } from './storage-backup.js';

const exportInputSchema = z.object({
  browserPreferences: z.record(z.string()).optional(),
});

export const handleBackupRoutes = async ({ req, res, pathname, context }: BackupRouteArgs) => {
  if (req.method === 'POST' && pathname === '/api/backups/export') {
    const input = readExportInput(await readJson(req, 1024 * 1024));
    const backup = context.backups.export(input.browserPreferences);
    writeBackupDownload(res, backup.fileName, backup.content);
    return true;
  }
  if (req.method === 'POST' && pathname === '/api/backups/import') {
    const result = context.backups.import(await readBytes(req, backupBodyLimitBytes));
    writeJson(res, 200, result);
    return true;
  }
  return false;
};

const readExportInput = (body: unknown): { browserPreferences: BrowserPreferences } => {
  const result = exportInputSchema.safeParse(body);
  if (!result.success) {
    throw badRequest('Invalid backup export payload');
  }
  return {
    browserPreferences: result.data.browserPreferences ?? {},
  };
};

const writeBackupDownload = (res: ServerResponse, fileName: string, content: Buffer) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${escapeContentDisposition(fileName)}"`);
  res.setHeader('Content-Length', String(content.byteLength));
  res.end(content);
};

const escapeContentDisposition = (value: string) => value.replace(/["\\]/g, '');
