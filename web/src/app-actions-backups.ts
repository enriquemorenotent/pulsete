import {
  downloadFullBackup,
  importFullBackup,
} from './backup-client.js';

export const createBackupActions = () => ({
  exportBackup: () => downloadFullBackup(),
  importBackup: (file: Blob) => importFullBackup(file),
});
