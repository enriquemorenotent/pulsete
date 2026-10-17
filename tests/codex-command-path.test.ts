import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { resolveInstalledCodexCommand } from '../server/codex-command-path.js';
import { runCommand } from '../server/codex-command-runner.js';

test('installed Codex takes precedence over npm dependency binaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'pulsete-codex-path-'));
  try {
    const bundled = join(root, 'node_modules', '.bin');
    const installed = join(root, 'bin');
    const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
    for (const directory of [bundled, installed]) {
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, executable), '');
      chmodSync(join(directory, executable), 0o755);
    }
    assert.equal(resolveInstalledCodexCommand({ PATH: [bundled, installed].join(delimiter) }),
      join(installed, executable));
    rmSync(join(installed, executable));
    assert.equal(resolveInstalledCodexCommand({ PATH: [bundled, installed].join(delimiter) }), null);
    assert.equal(resolveInstalledCodexCommand({ PATH: '' }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('desktop launch finds NVM Codex and its Node runtime with a minimal PATH', {
  skip: process.platform === 'win32',
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'pulsete-codex-desktop-'));
  const originalPath = process.env.PATH;
  try {
    for (const version of ['v9.0.0', 'v24.20.0']) {
      const bin = join(root, '.nvm', 'versions', 'node', version, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(bin, 'codex'), '#!/usr/bin/env node\nconsole.log("desktop runtime found");\n');
      chmodSync(join(bin, 'codex'), 0o755);
      // A wrapper makes the test independent of whether /usr/bin/node exists.
      writeFileSync(join(bin, 'node'), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`);
      chmodSync(join(bin, 'node'), 0o755);
    }
    const command = resolveInstalledCodexCommand({ HOME: root, PATH: '/usr/bin:/bin' });
    assert.equal(command, join(root, '.nvm', 'versions', 'node', 'v24.20.0', 'bin', 'codex'));
    process.env.PATH = '/nonexistent-pulsete-test-path';
    const result = await runCommand(command!, ['login', 'status'], { timeoutMs: 5_000 });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'desktop runtime found');
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test('desktop fallbacks respect custom NVM directories and existing PATH priority', {
  skip: process.platform === 'win32',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'pulsete-codex-custom-'));
  try {
    const bin = join(root, 'custom-nvm', 'versions', 'node', 'v24.1.0', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'codex'), '');
    chmodSync(join(bin, 'codex'), 0o755);
    const env = { HOME: root, NVM_DIR: join(root, 'custom-nvm'), PATH: '' };
    assert.equal(resolveInstalledCodexCommand(env), join(bin, 'codex'));
    const local = join(root, '.local', 'bin');
    mkdirSync(local, { recursive: true });
    writeFileSync(join(local, 'codex'), '');
    chmodSync(join(local, 'codex'), 0o755);
    assert.equal(resolveInstalledCodexCommand({ ...env, PATH: bin }), join(bin, 'codex'));
    assert.equal(resolveInstalledCodexCommand({ ...env, NVM_DIR: '/nonexistent' }), join(local, 'codex'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
