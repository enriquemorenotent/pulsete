import {
  parseDownloadFileName,
  triggerFileDownload,
} from './browser-download.js';
import {
  readPulseteBrowserPreferences,
  restoreLegacyBrowserPreferences,
  type BrowserPreferences,
} from './legacy-browser-storage-import.js';

export { readPulseteBrowserPreferences, type BrowserPreferences };
export const restorePulseteBrowserPreferences = restoreLegacyBrowserPreferences;

export const downloadFullBackup = async () => {
  const response = await fetch('/api/backups/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  const blob = await response.blob();
  const fileName = parseDownloadFileName(response.headers.get('Content-Disposition'))
    ?? 'pulsete-backup.pulsete-backup';
  triggerFileDownload(blob, fileName);
};

export const importFullBackup = async (file: Blob) => {
  const response = await fetch('/api/backups/import', {
    method: 'POST',
    body: file,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  const browserPreferences = readBrowserPreferencesResponse(body);
  restoreLegacyBrowserPreferences(browserPreferences);
  window.location.reload();
};

const readBrowserPreferencesResponse = (body: unknown): BrowserPreferences => {
  const value = (body as { browserPreferences?: unknown } | null)?.browserPreferences;
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      entry[0].startsWith('pulsete.') && typeof entry[1] === 'string'
    )
  );
};
