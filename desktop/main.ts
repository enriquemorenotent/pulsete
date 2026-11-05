import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import { join } from 'node:path';
import { startDesktopServer, type DesktopServer } from './server-process.js';
import {
  handleDesktopNavigationCommand,
  restrictDesktopNavigationToOrigin,
} from './navigation-history.js';
import { configureNotificationPermissions } from './notification-permissions.js';
import { configureDesktopZoom } from './zoom.js';

let mainWindow: BrowserWindow | null = null;
let serverHandle: DesktopServer | null = null;
let isQuitting = false;
let shutdownComplete = false;

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

app.on('before-quit', (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (isQuitting) return;
  isQuitting = true;
  void stopServer().finally(() => {
    shutdownComplete = true;
    app.quit();
  });
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
  Menu.setApplicationMenu(null);

  serverHandle = await startDesktopServer({
    assetRoot: join(app.getAppPath(), 'dist'),
    dataDirectory: app.getPath('userData'),
    host: '127.0.0.1',
    port: 0,
  }, () => app.quit());

  mainWindow = createMainWindow(serverHandle);
  await mainWindow.loadURL(serverHandle.clientUrl);
}

function createMainWindow(server: DesktopServer) {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      // Let the web title bar (including modal backdrops) show behind native controls.
      color: '#00000000',
      symbolColor: '#aebdce',
      height: 64,
    },
    title: 'Pulsete',
    icon: join(app.getAppPath(), 'build-resources', 'icons', '512x512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  configureNotificationPermissions(window.webContents.session, window, server.url);
  configureDesktopZoom(window, join(app.getPath('userData'), 'desktop-zoom.json'));

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
    void dialog.showMessageBox({
      type: 'warning', title: 'Open external link?',
      message: 'This link opens outside the account’s VPN connection.',
      detail: 'Your browser uses its own connection and cookies. The website may be able to link this visit to your other activity.',
      buttons: ['Cancel', 'Open in browser'], defaultId: 0, cancelId: 0,
    }).then(result => { if (result.response === 1) return shell.openExternal(url.toString()); }).catch(() => {});
  } catch {
    // Ignore malformed navigation targets from renderer content.
  }
}
