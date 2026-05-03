import { dirname, join, resolve } from 'node:path';

export type AppPaths = {
  backupDirectory: string;
  dataDirectory: string;
  databasePath: string;
  networkSecretPath: string;
};

export type AppPathInput = {
  dataDirectory?: string;
  databasePath?: string;
};

const defaultDataDirectory = () => resolve(process.env.PULSETE_DATA_DIR ?? 'data');

export const resolveAppPaths = (input: AppPathInput = {}): AppPaths => {
  const dataDirectory = resolve(input.dataDirectory ?? defaultDataDirectory());
  const databasePath = resolve(input.databasePath ?? join(dataDirectory, 'pulsete.sqlite'));
  const storageDirectory = dirname(databasePath);
  return {
    backupDirectory: join(storageDirectory, 'backups'),
    dataDirectory,
    databasePath,
    networkSecretPath: join(storageDirectory, 'pulsete.secret'),
  };
};

