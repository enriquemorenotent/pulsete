import {
  parseDownloadFileName,
  triggerFileDownload,
} from './browser-download.js';

export type BrowserPreferences = Record<string, string>;

const localStoragePrefix = 'pulsete.';

export const readPulseteBrowserPreferences = (): BrowserPreferences => {
  if (typeof window === 'undefined') {
    return {};
  }
  const preferences: BrowserPreferences = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(localStoragePrefix)) {
      continue;
    }
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      preferences[key] = value;
    }
  }
  return preferences;
};

export const restorePulseteBrowserPreferences = (preferences: BrowserPreferences) => {
  if (typeof window === 'undefined') {
    return;
  }
  const existingKeys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(localStoragePrefix)) {
      existingKeys.push(key);
    }
  }
  for (const key of existingKeys) {
    window.localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(preferences)) {
    if (key.startsWith(localStoragePrefix) && typeof value === 'string') {
      window.localStorage.setItem(key, value);
    }
  }
};

export const downloadFullBackup = async () => {
  const response = await fetch('/api/backups/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      browserPreferences: readPulseteBrowserPreferences(),
    }),
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
  restorePulseteBrowserPreferences(browserPreferences);
  window.location.reload();
};

const readBrowserPreferencesResponse = (body: unknown): BrowserPreferences => {
  const value = (body as { browserPreferences?: unknown } | null)?.browserPreferences;
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      entry[0].startsWith(localStoragePrefix) && typeof entry[1] === 'string'
    )
  );
};
