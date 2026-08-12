import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { startPulseteServer, type PulseteServerHandle } from '../server/server-app.js';
import {
  handleDesktopNavigationCommand,
  restrictDesktopNavigationToOrigin,
} from './navigation-history.js';
import { configureNotificationPermissions } from './notification-permissions.js';

let mainWindow: BrowserWindow | null = null;
let serverHandle: PulseteServerHandle | null = null;
let isQuitting = false;

const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(startDesktopApp).catch((error: unknown) => {
    console.error('Failed to start Pulsete desktop app', error);
    process.exitCode = 1;
    app.quit();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  void stopServer();
});

app.on('window-all-closed', () => {
  app.quit();
});

process.once('SIGINT', () => {
  app.quit();
});

process.once('SIGTERM', () => {
  app.quit();
});

async function startDesktopApp() {
  serverHandle = await startPulseteServer({
    assetRoot: join(app.getAppPath(), 'dist'),
    dataDirectory: app.getPath('userData'),
    host: '127.0.0.1',
    port: 0,
  });

  mainWindow = createMainWindow(serverHandle);
  await mainWindow.loadURL(serverHandle.clientUrl);
}

function createMainWindow(server: PulseteServerHandle) {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Pulsete',
    icon: join(app.getAppPath(), 'build-resources', 'icons', '512x512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureNotificationPermissions(window.webContents.session, window, server.url);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('closed', () => {
    mainWindow = null;
    if (!isQuitting) {
      app.quit();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openTrustedExternalUrl(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (hasSameOrigin(url, server.url)) {
      return;
    }
    event.preventDefault();
    openTrustedExternalUrl(url);
  });

  window.on('app-command', (event, command) => {
    if (
      handleDesktopNavigationCommand(
        command,
        restrictDesktopNavigationToOrigin(
          window.webContents.navigationHistory,
          server.url,
        ),
      )
    ) {
      event.preventDefault();
    }
  });

  return window;
}

async function stopServer() {
  const current = serverHandle;
  serverHandle = null;
  await current?.close();
}

function hasSameOrigin(value: string, expected: string) {
  try {
    return new URL(value).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}

function openTrustedExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return;
    }
    void shell.openExternal(url.toString());
  } catch {
    // Ignore malformed navigation targets from renderer content.
  }
}
