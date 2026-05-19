import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

const requestedTargets = new Set(process.argv.slice(2));
const shouldBuildServer = requestedTargets.size === 0 || requestedTargets.has('--server');
const shouldBuildDesktop = requestedTargets.size === 0 || requestedTargets.has('--desktop');

const commonOptions = {
  bundle: true,
  logLevel: 'info',
  platform: 'node',
  sourcemap: true,
  target: 'node24',
};

if (shouldBuildServer) {
  await rm('build/server', { recursive: true, force: true });
  await build({
    ...commonOptions,
    entryPoints: ['server/index.ts'],
    external: ['better-sqlite3'],
    format: 'cjs',
    outfile: 'build/server/index.cjs',
  });
}

if (shouldBuildDesktop) {
  await rm('build/desktop', { recursive: true, force: true });
  await build({
    ...commonOptions,
    entryPoints: ['desktop/main.ts'],
    external: ['better-sqlite3', 'electron'],
    format: 'cjs',
    outfile: 'build/desktop/main.cjs',
  });
}
