import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { resolveInstalledCodexCommand } from '../server/codex-command-path.js';

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
