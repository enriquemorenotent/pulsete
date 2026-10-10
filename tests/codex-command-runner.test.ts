import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand, readFailure } from '../server/codex-command-runner.js';

test('a process ignoring SIGTERM is force-stopped with a clear timeout', async () => {
  const started = Date.now();
  const result = await runCommand(process.execPath, ['-e',
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 10);'],
  { timeoutMs: 300, killGraceMs: 100 });
  assert.equal(result.error?.code, 'ETIMEDOUT');
  assert.match(readFailure(result) ?? '', /timed out/);
  assert.ok(Date.now() - started < 3_000);
});

test('abort signals stop a running command', async () => {
  const controller = new AbortController();
  const pending = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 10);'],
    { timeoutMs: 10_000, signal: controller.signal, killGraceMs: 100 });
  controller.abort();
  const result = await pending;
  assert.equal(result.error?.code, 'ABORT_ERR');
  assert.match(readFailure(result) ?? '', /cancelled/);
});

test('CLI diagnostics are bounded', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(100_000));'],
    { timeoutMs: 5_000 });
  assert.equal(result.code, 0);
  assert.equal(result.stdout.length, 64_000);
});
