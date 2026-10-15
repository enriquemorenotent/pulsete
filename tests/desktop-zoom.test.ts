import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { BrowserWindow, Input } from 'electron';
import { configureDesktopZoom, nextZoomFactor, readZoomFactor, resolveZoomCommand } from '../desktop/zoom.js';

const key = (overrides: Partial<Input> = {}): Input => ({
  type: 'keyDown', key: '=', code: 'Equal', control: true, meta: false,
  alt: false, shift: false, isComposing: false, isAutoRepeat: false,
  location: 0, modifiers: ['control'], ...overrides,
});

test('desktop zoom handles US, German and keypad shortcuts', () => {
  for (const input of [key(), key({ key: '+', shift: true }), key({ key: '+', code: 'BracketRight' }), key({ key: '+', code: 'NumpadAdd' })]) {
    assert.equal(resolveZoomCommand(input, 'linux'), 'in');
  }
  assert.equal(resolveZoomCommand(key({ key: '-', code: 'Slash' }), 'linux'), 'out');
  assert.equal(resolveZoomCommand(key({ key: '-', code: 'NumpadSubtract' }), 'linux'), 'out');
  assert.equal(resolveZoomCommand(key({ key: '0', code: 'Digit0' }), 'linux'), 'reset');
  assert.equal(resolveZoomCommand(key({ key: '0', code: 'Numpad0' }), 'linux'), 'reset');
  assert.equal(resolveZoomCommand(key({ control: false, meta: true }), 'darwin'), 'in');
});

test('desktop zoom leaves typing, AltGr, composing and unrelated shortcuts alone', () => {
  for (const input of [key({ control: false }), key({ alt: true }), key({ meta: true }), key({ isComposing: true }), key({ type: 'keyUp' }), key({ key: 'k', code: 'KeyK' }), key({ key: ')', code: 'Digit0', shift: true })]) {
    assert.equal(resolveZoomCommand(input, 'linux'), null);
  }
});

test('desktop zoom steps in both directions, resets and stops at its limits', () => {
  assert.equal(nextZoomFactor(1, 'in'), 1.1);
  assert.equal(nextZoomFactor(1.1, 'out'), 1);
  assert.equal(nextZoomFactor(1.25, 'reset'), 1);
  assert.equal(nextZoomFactor(2, 'in'), 2);
  assert.equal(nextZoomFactor(0.5, 'out'), 0.5);
});

test('desktop zoom ignores missing, corrupt and out-of-range saved preferences', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-zoom-'));
  try {
    const path = join(dir, 'zoom.json');
    assert.equal(readZoomFactor(path), 1);
    for (const content of ['oops', 'null', '{}', '{"zoomFactor": "1.5"}', '{"zoomFactor": 0}', '{"zoomFactor": 4}']) {
      writeFileSync(path, content);
      assert.equal(readZoomFactor(path), 1);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('desktop zoom persists across windows and reloads while resizing the titlebar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulsete-zoom-'));
  try {
    const path = join(dir, 'zoom.json');
    const createWindow = () => {
      const contents = Object.assign(new EventEmitter(), { setZoomFactor: (value: number) => { factor = value; } });
      let factor = 1;
      let height = 64;
      const window = { webContents: contents, setTitleBarOverlay: (options: { height: number }) => { height = options.height; } };
      configureDesktopZoom(window as unknown as BrowserWindow, path);
      return { contents, factor: () => factor, height: () => height };
    };
    const first = createWindow();
    let prevented = false;
    first.contents.emit('before-input-event', { preventDefault: () => { prevented = true; } }, key());
    assert.equal(prevented, true);
    assert.equal(first.factor(), 1.1);
    assert.equal(first.height(), 70);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { zoomFactor: 1.1 });
    const second = createWindow();
    second.contents.emit('did-finish-load');
    assert.equal(second.factor(), 1.1);
    second.contents.emit('before-input-event', { preventDefault() {} }, key({ key: '0' }));
    second.contents.emit('did-finish-load');
    assert.equal(second.factor(), 1);
    assert.equal(second.height(), 64);
    assert.equal(readZoomFactor(path), 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
