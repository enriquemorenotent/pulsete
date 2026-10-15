import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { BrowserWindow, Input } from 'electron';

type ZoomCommand = 'in' | 'out' | 'reset';
type ZoomInput = Pick<Input, 'type' | 'key' | 'code' | 'control' | 'meta' | 'alt' | 'shift' | 'isComposing'>;
const zoomSteps = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function resolveZoomCommand(input: ZoomInput, platform = process.platform): ZoomCommand | null {
  const modifier = platform === 'darwin' ? input.meta && !input.control : input.control && !input.meta;
  if (input.type !== 'keyDown' || !modifier || input.alt || input.isComposing) return null;
  if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') return 'in';
  if (input.key === '-' || input.code === 'NumpadSubtract') return 'out';
  if (!input.shift && (input.key === '0' || input.code === 'Numpad0')) return 'reset';
  return null;
}

export function nextZoomFactor(current: number, command: ZoomCommand): number {
  if (command === 'reset') return 1;
  return command === 'in'
    ? zoomSteps.find((step) => step > current + 0.001) ?? 2
    : [...zoomSteps].reverse().find((step) => step < current - 0.001) ?? 0.5;
}

export function readZoomFactor(path: string): number {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'))?.zoomFactor;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2 ? value : 1;
  } catch {
    return 1;
  }
}

export function configureDesktopZoom(window: BrowserWindow, preferencesPath: string) {
  let factor = readZoomFactor(preferencesPath);
  const apply = () => {
    window.webContents.setZoomFactor(factor);
    window.setTitleBarOverlay({ height: Math.round(64 * factor) });
  };
  // The server uses a new port each launch, so Chromium's per-origin setting
  // alone cannot preserve the user's zoom. Reapply it after page reloads too.
  window.webContents.on('did-finish-load', apply);
  window.webContents.on('before-input-event', (event, input) => {
    const command = resolveZoomCommand(input);
    if (!command) return;
    event.preventDefault();
    const next = nextZoomFactor(factor, command);
    if (next === factor) return;
    factor = next;
    apply();
    try {
      writeFileSync(`${preferencesPath}.tmp`, JSON.stringify({ zoomFactor: factor }) + '\n', { mode: 0o600 });
      renameSync(`${preferencesPath}.tmp`, preferencesPath);
    } catch (error) {
      console.warn('Could not save desktop zoom preference', error);
    }
  });
}
