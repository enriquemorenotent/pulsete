import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqliteDatabase } from '../../server/storage-sqlite.js';
import { Storage } from '../../server/storage.js';

export { openSqliteDatabase, Storage };

export const makeStorageFile = () =>
  join(mkdtempSync(join(tmpdir(), 'pulsete-storage-')), 'db.sqlite');
