import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { AppPaths } from './app-paths.js';
import { openSqliteDatabase } from './storage-sqlite.js';

export type PreparedStorageReplacement = {
  activate: () => void;
  commit: () => void;
  dispose: () => void;
  rollback: () => void;
};

export const prepareStorageReplacement = (input: {
  sourcePaths: AppPaths;
  targetPaths: AppPaths;
}): PreparedStorageReplacement => {
  const id = randomUUID();
  const targetDirectory = dirname(input.targetPaths.databasePath);
  const stageDatabasePath = join(targetDirectory, `.pulsete-restore-${id}.sqlite`);
  const stageSecretPath = join(targetDirectory, `.pulsete-restore-${id}.secret`);
  const backupDirectory = join(
    input.targetPaths.backupDirectory,
    `pre-restore-${formatBackupTimestamp(new Date())}-${id}`,
  );
  const backupDatabasePath = join(backupDirectory, basename(input.targetPaths.databasePath));
  const backupSecretPath = join(backupDirectory, basename(input.targetPaths.networkSecretPath));
  mkdirSync(targetDirectory, { recursive: true });
  createStandaloneDatabase(input.sourcePaths.databasePath, stageDatabasePath);
  copyFileWithModeIfPresent(input.sourcePaths.networkSecretPath, stageSecretPath);

  let activationStarted = false;
  let committed = false;
  const removeStagedFiles = () => {
    rmSync(stageDatabasePath, { force: true });
    rmSync(stageSecretPath, { force: true });
  };
  const restoreOriginalFiles = () => {
    removeStorageFiles(input.targetPaths);
    moveIfPresent(backupDatabasePath, input.targetPaths.databasePath);
    moveIfPresent(`${backupDatabasePath}-wal`, `${input.targetPaths.databasePath}-wal`);
    moveIfPresent(`${backupDatabasePath}-shm`, `${input.targetPaths.databasePath}-shm`);
    moveIfPresent(backupSecretPath, input.targetPaths.networkSecretPath);
    rmSync(backupDirectory, { force: true, recursive: true });
  };

  return {
    activate: () => {
      mkdirSync(backupDirectory, { recursive: true });
      try {
        copyFileIfPresent(input.targetPaths.databasePath, backupDatabasePath);
        copyFileIfPresent(`${input.targetPaths.databasePath}-wal`, `${backupDatabasePath}-wal`);
        copyFileIfPresent(`${input.targetPaths.databasePath}-shm`, `${backupDatabasePath}-shm`);
        copyFileIfPresent(input.targetPaths.networkSecretPath, backupSecretPath);
        activationStarted = true;
        removeStorageSidecarsAndSecret(input.targetPaths);
        moveIfPresent(stageSecretPath, input.targetPaths.networkSecretPath);
        renameSync(stageDatabasePath, input.targetPaths.databasePath);
      } catch (error) {
        if (activationStarted) {
          restoreOriginalFiles();
        } else {
          rmSync(backupDirectory, { force: true, recursive: true });
        }
        activationStarted = false;
        throw error;
      }
    },
    commit: () => {
      committed = true;
      activationStarted = false;
      removeStagedFiles();
    },
    dispose: () => {
      if (!activationStarted) {
        removeStagedFiles();
        if (!committed) {
          rmSync(backupDirectory, { force: true, recursive: true });
        }
      }
    },
    rollback: () => {
      if (!activationStarted) {
        return;
      }
      restoreOriginalFiles();
      activationStarted = false;
      removeStagedFiles();
    },
  };
};

const createStandaloneDatabase = (sourcePath: string, destinationPath: string) => {
  const db = openSqliteDatabase(sourcePath);
  try {
    db.exec(`VACUUM INTO ${sqlStringLiteral(destinationPath)}`);
  } finally {
    db.close();
  }
  chmodSync(destinationPath, 0o600);
};

const removeStorageFiles = (paths: AppPaths) => {
  rmSync(paths.databasePath, { force: true });
  removeStorageSidecarsAndSecret(paths);
};

const removeStorageSidecarsAndSecret = (paths: AppPaths) => {
  rmSync(`${paths.databasePath}-wal`, { force: true });
  rmSync(`${paths.databasePath}-shm`, { force: true });
  rmSync(paths.networkSecretPath, { force: true });
};

const moveIfPresent = (source: string, destination: string) => {
  if (existsSync(source)) {
    renameSync(source, destination);
  }
};

const copyFileWithModeIfPresent = (source: string, destination: string) => {
  if (existsSync(source)) {
    copyFileSync(source, destination);
    chmodSync(destination, 0o600);
  }
};

const copyFileIfPresent = (source: string, destination: string) => {
  if (existsSync(source)) {
    copyFileSync(source, destination);
  }
};

const formatBackupTimestamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

const sqlStringLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
