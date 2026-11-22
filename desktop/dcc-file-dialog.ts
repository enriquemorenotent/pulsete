import { app, dialog, type BrowserWindow } from 'electron';
import { basename, join } from 'node:path';
import type { DccFileDialog } from '../shared/dcc.js';

export async function pickDesktopDccFile(window: BrowserWindow, request: DccFileDialog) {
  if (request.kind === 'receive') {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save DCC file',
      defaultPath: join(app.getPath('downloads'), basename(request.filename)),
      buttonLabel: 'Save file',
    });
    return result.canceled ? null : result.filePath ?? null;
  }

  const result = await dialog.showOpenDialog(window, { title: 'Choose file to send', properties: ['openFile'] });
  const path = result.filePaths[0];
  if (result.canceled || !path || window.isDestroyed()) return null;
  const confirmation = await dialog.showMessageBox(window, {
    type: 'question',
    title: 'Send DCC file',
    message: `Offer “${basename(path)}” to ${request.peer}?`,
    detail: 'DCC sends files without encryption and shares your IP address with the recipient.',
    buttons: ['Cancel', 'Send file'],
    defaultId: 0,
    cancelId: 0,
  });
  return confirmation.response === 1 ? path : null;
}
