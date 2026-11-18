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
    entryPoints: { index: 'server/index.ts', 'ai-assistant-embedding-worker': 'server/ai-assistant-embedding-worker.ts' },
    external: ['better-sqlite3', 'onnxruntime-node'],
    format: 'cjs',
    outdir: 'build/server',
    outExtension: { '.js': '.cjs' },
  });
}

if (shouldBuildDesktop) {
  await rm('build/desktop', { recursive: true, force: true });
  await build({
    ...commonOptions,
    entryPoints: {
      main: 'desktop/main.ts',
      'server-process-entry': 'desktop/server-process-entry.ts',
      'ai-assistant-embedding-worker': 'server/ai-assistant-embedding-worker.ts',
    },
    external: ['better-sqlite3', 'electron', 'onnxruntime-node'],
    format: 'cjs',
    outdir: 'build/desktop',
    outExtension: { '.js': '.cjs' },
  });
}
