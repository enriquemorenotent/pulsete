import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { badRequest } from './app-error.js';
import { isValidNetworkSecretContent } from './network-secret.js';
import type { AppPaths } from './app-paths.js';
import { currentStorageSchemaVersion } from './storage-migrations.js';
import { hasEncryptedNetworkPasswords } from './storage-networks.js';
import { openSqliteDatabase, type SqliteDb } from './storage-sqlite.js';
import { userStateStorageSchemaVersion } from './storage-user-state-schema.js';

const backupFormat = 'pulsete.backup.v1';
const sqliteHeader = 'SQLite format 3\u0000';

export type BrowserPreferences = Record<string, string>;

export type StorageBackupDownload = {
  content: Buffer;
  fileName: string;
};

type PreparedStorageRestore = {
  apply: () => void;
  browserPreferences: BrowserPreferences;
};

type BackupEnvelope = {
  browserPreferences: BrowserPreferences;
  createdAt: string;
  database: string;
  format: typeof backupFormat;
  secret: string | null;
  storageSchemaVersion: number;
};

type ParsedBackup = {
  browserPreferences: BrowserPreferences;
  database: Buffer;
  secret: string | null;
  storageSchemaVersion: number;
};

export const createStorageBackup = (input: {
  browserPreferences: BrowserPreferences;
  db: SqliteDb;
  paths: AppPaths;
}): StorageBackupDownload => {
  const createdAt = new Date();
  const tempDir = mkdtempSync(join(tmpdir(), 'pulsete-backup-'));
  const backupDatabasePath = join(tempDir, `${randomUUID()}.sqlite`);
  try {
    input.db.exec(`VACUUM INTO ${sqlStringLiteral(backupDatabasePath)}`);
    const envelope: BackupEnvelope = {
      browserPreferences: normalizeBrowserPreferences(input.browserPreferences),
      createdAt: createdAt.toISOString(),
      database: readFileSync(backupDatabasePath).toString('base64'),
      format: backupFormat,
      secret: readNetworkSecret(input.paths.networkSecretPath),
      storageSchemaVersion: currentStorageSchemaVersion,
    };
    return {
      content: gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8')),
      fileName: `pulsete-backup-${formatBackupTimestamp(createdAt)}.pulsete-backup`,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
};

export const prepareStorageBackupRestore = (input: {
  backupContent: Buffer;
  paths: AppPaths;
}): PreparedStorageRestore => {
  const backup = parseStorageBackup(input.backupContent);
  const tempDir = mkdtempSync(join(tmpdir(), 'pulsete-restore-'));
  const validationPath = join(tempDir, 'restore.sqlite');
  try {
    writeFileSync(validationPath, backup.database, { mode: 0o600 });
    validateBackupDatabase(validationPath, backup.storageSchemaVersion, backup.secret !== null);
    return {
      browserPreferences: backup.browserPreferences,
      apply: () => {
        createPreRestoreBackup(input.paths);
        replaceStorageFiles(input.paths, backup);
      },
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
};

const parseStorageBackup = (content: Buffer): ParsedBackup => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(content).toString('utf8'));
  } catch {
    throw badRequest('Invalid backup file');
  }
  const envelope = readBackupEnvelope(parsed);
  if (envelope.storageSchemaVersion > currentStorageSchemaVersion) {
    throw badRequest('Backup was created by a newer Pulsete version');
  }
  const database = decodeDatabase(envelope.database);
  const secret = normalizeSecret(envelope.secret);
  return {
    browserPreferences: normalizeBrowserPreferences(envelope.browserPreferences),
    database,
    secret,
    storageSchemaVersion: envelope.storageSchemaVersion,
  };
};

const readBackupEnvelope = (value: unknown): BackupEnvelope => {
  if (!value || typeof value !== 'object') {
    throw badRequest('Invalid backup file');
  }
  const envelope = value as Partial<BackupEnvelope>;
  if (
    envelope.format !== backupFormat
    || typeof envelope.createdAt !== 'string'
    || typeof envelope.database !== 'string'
    || typeof envelope.storageSchemaVersion !== 'number'
    || !Number.isInteger(envelope.storageSchemaVersion)
    || !envelope.browserPreferences
    || typeof envelope.browserPreferences !== 'object'
    || !(typeof envelope.secret === 'string' || envelope.secret === null)
  ) {
    throw badRequest('Invalid backup file');
  }
  return envelope as BackupEnvelope;
};

const decodeDatabase = (value: string) => {
  const database = Buffer.from(value, 'base64');
  if (database.length === 0 || database.subarray(0, sqliteHeader.length).toString('utf8') !== sqliteHeader) {
    throw badRequest('Invalid backup database');
  }
  return database;
};

const validateBackupDatabase = (databasePath: string, declaredVersion: number, hasSecret: boolean) => {
  const db = openSqliteDatabase(databasePath);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined;
    const version = Number(
      (db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0
    );
    if (integrity?.integrity_check !== 'ok' || version !== declaredVersion) {
      throw badRequest('Invalid backup database');
    }
    if (
      version > currentStorageSchemaVersion
      || !hasRequiredTables(db, version)
      || (hasEncryptedNetworkPasswords(db) && !hasSecret)
    ) {
      throw badRequest('Invalid backup database');
    }
  } finally {
    db.close();
  }
};

const hasRequiredTables = (db: SqliteDb, version: number) =>
  [
    'networks',
    'buffers',
    'messages',
    ...(version >= userStateStorageSchemaVersion ? [
      'workspace_preferences',
      'buffer_drafts',
      'user_avatar_overrides',
    ] : []),
  ].every((table) =>
    Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
  );

const createPreRestoreBackup = (paths: AppPaths) => {
  const backupDir = join(paths.backupDirectory, `pre-restore-${formatBackupTimestamp(new Date())}-${randomUUID()}`);
  mkdirSync(backupDir, { recursive: true });
  copyIfPresent(paths.databasePath, join(backupDir, basename(paths.databasePath)));
  copyIfPresent(`${paths.databasePath}-wal`, join(backupDir, `${basename(paths.databasePath)}-wal`));
  copyIfPresent(`${paths.databasePath}-shm`, join(backupDir, `${basename(paths.databasePath)}-shm`));
  copyIfPresent(paths.networkSecretPath, join(backupDir, basename(paths.networkSecretPath)));
};

const replaceStorageFiles = (paths: AppPaths, backup: ParsedBackup) => {
  mkdirSync(dirname(paths.databasePath), { recursive: true });
  rmSync(paths.databasePath, { force: true });
  rmSync(`${paths.databasePath}-wal`, { force: true });
  rmSync(`${paths.databasePath}-shm`, { force: true });
  writeFileSync(paths.databasePath, backup.database, { mode: 0o600 });
  if (backup.secret) {
    writeFileSync(paths.networkSecretPath, `${backup.secret}\n`, { mode: 0o600 });
    return;
  }
  rmSync(paths.networkSecretPath, { force: true });
};

const normalizeBrowserPreferences = (value: BrowserPreferences) =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([key, entryValue]) =>
        key.startsWith('pulsete.') && typeof entryValue === 'string'
      )
      .sort(([left], [right]) => left.localeCompare(right))
  );

const readNetworkSecret = (secretPath: string) => {
  if (!existsSync(secretPath)) {
    return null;
  }
  const secret = readFileSync(secretPath, 'utf8').trim();
  return normalizeSecret(secret);
};

const normalizeSecret = (value: string | null) => {
  if (value === null) {
    return null;
  }
  const secret = value.trim();
  if (!isValidNetworkSecretContent(secret)) {
    throw badRequest('Invalid backup secret');
  }
  return secret;
};

const copyIfPresent = (source: string, destination: string) => {
  if (existsSync(source)) {
    copyFileSync(source, destination);
  }
};

const formatBackupTimestamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

const sqlStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
