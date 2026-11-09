import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { BrowserWindow } from 'electron';
import { createDiagnosticLog, diagnosticText, observeDesktopWindow } from '../desktop/diagnostics.js';

test('desktop diagnostics record renderer failures without bootstrap credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-diagnostics-'));
  try {
    const log = createDiagnosticLog(directory);
    const contents = new EventEmitter();
    const window = Object.assign(new EventEmitter(), { webContents: contents });
    observeDesktopWindow(window as unknown as BrowserWindow, log);
    contents.emit('did-finish-load');
    contents.emit('console-message', { level: 'info', message: 'ordinary chat activity' });
    contents.emit('console-message', {
      level: 'error', message: 'Uncaught TypeError at http://127.0.0.1:1234/#pulsete-bootstrap=secret',
      sourceId: 'http://127.0.0.1:1234/assets/app.js?token=secret', lineNumber: 12,
    });
    contents.emit('unresponsive');
    contents.emit('responsive');
    contents.emit('render-process-gone', {}, { reason: 'oom', exitCode: -9 });
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'http://localhost/#secret', false);
    contents.emit('did-fail-load', {}, -2, 'ERR_FAILED', 'http://localhost/#secret', true);
    window.emit('closed');
    const text = readFileSync(join(directory, 'desktop.jsonl'), 'utf8');
    const entries = text.trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(entries.map(entry => entry.event), [
      'page-loaded', 'renderer-error', 'renderer-unresponsive', 'renderer-responsive',
      'render-process-gone', 'load-failed', 'window-closed',
    ]);
    assert.equal(entries[4].reason, 'oom');
    assert.equal(entries[4].exitCode, -9);
    assert.equal(text.includes('secret'), false);
    assert.equal(text.includes('ordinary chat activity'), false);
    assert.equal(statSync(join(directory, 'desktop.jsonl')).mode & 0o777, 0o600);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('desktop diagnostics rotate logs and tolerate an unwritable destination', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulsete-diagnostics-'));
  try {
    const log = createDiagnosticLog(directory, 1);
    log('first');
    log('second');
    assert.equal(JSON.parse(readFileSync(join(directory, 'desktop.jsonl.previous'), 'utf8')).event, 'first');
    assert.equal(JSON.parse(readFileSync(join(directory, 'desktop.jsonl'), 'utf8')).event, 'second');
    const blocked = join(directory, 'not-a-directory');
    writeFileSync(blocked, 'file');
    assert.doesNotThrow(() => createDiagnosticLog(blocked)('startup'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('desktop diagnostic text limits long errors and removes URL queries and fragments', () => {
  assert.equal(diagnosticText('at https://localhost/a.js?key=value#fragment next'), 'at https://localhost/a.js next');
  assert.equal(diagnosticText('x'.repeat(10_000)).length, 8_000);
});
