import { accessSync, constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';

export const resolveInstalledCodexCommand = (env: NodeJS.ProcessEnv): string | null => {
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const directories = (env.PATH ?? '').split(delimiter)
    .filter((directory) => directory && !/(^|[/\\])node_modules([/\\]|$)/.test(directory));
  for (const directory of directories) {
    const candidate = resolve(directory, executable);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch { /* Continue looking for the user's installed CLI. */ }
  }
  return null;
};
