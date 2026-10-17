import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const desktopDirectories = (env: NodeJS.ProcessEnv): string[] => {
  if (process.platform === 'win32') return [];
  const home = env.HOME;
  const nvm = env.NVM_DIR || (home ? join(home, '.nvm') : null);
  const directories = home ? [join(home, '.local', 'bin'), join(home, '.npm-global', 'bin')] : [];
  if (env.NPM_CONFIG_PREFIX) directories.push(join(env.NPM_CONFIG_PREFIX, 'bin'));
  if (nvm) {
    const versions = join(nvm, 'versions', 'node');
    try {
      directories.push(...readdirSync(versions)
        .filter((version) => /^v\d+\.\d+\.\d+$/.test(version))
        .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
        .map((version) => join(versions, version, 'bin')));
    } catch { /* NVM is optional. */ }
  }
  return directories;
};

// npm-installed Codex uses /usr/bin/env node. Its Node installation must also
// be visible when the desktop session has never loaded the user's shell setup.
export const codexCommandEnvironment = (command: string): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: isAbsolute(command)
    ? [dirname(command), process.env.PATH ?? ''].join(delimiter)
    : process.env.PATH,
});

export const resolveInstalledCodexCommand = (env: NodeJS.ProcessEnv): string | null => {
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const directories = [...(env.PATH ?? '').split(delimiter), ...desktopDirectories(env)]
    .filter((directory) => directory && !/(^|[/\\])node_modules([/\\]|$)/.test(directory));
  for (const directory of directories) {
    const candidate = resolve(directory, executable);
    try {
      accessSync(candidate, constants.X_OK);
      if (!statSync(candidate).isFile()) continue;
      return candidate;
    } catch { /* Continue looking for the user's installed CLI. */ }
  }
  return null;
};
