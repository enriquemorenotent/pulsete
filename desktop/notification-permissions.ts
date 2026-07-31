import type { BrowserWindow, Session, WebContents } from 'electron';

export const configureNotificationPermissions = (
  session: Session,
  mainWindow: BrowserWindow,
  trustedOrigin: string,
) => {
  const isTrusted = (
    webContents: WebContents | null,
    permission: string,
    requestingUrl: string,
    isMainFrame: boolean,
  ) => isTrustedNotificationPermission({
    isMainFrame,
    isMainWindow: webContents === mainWindow.webContents,
    permission,
    requestingUrl,
    trustedOrigin,
  });

  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
    isTrusted(
      webContents,
      permission,
      details.requestingUrl ?? requestingOrigin,
      details.isMainFrame,
    )
  );
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isTrusted(
      webContents,
      permission,
      details.requestingUrl,
      details.isMainFrame,
    ));
  });
};

export const isTrustedNotificationPermission = (input: {
  isMainFrame: boolean;
  isMainWindow: boolean;
  permission: string;
  requestingUrl: string;
  trustedOrigin: string;
}) => input.permission === 'notifications'
  && input.isMainFrame
  && input.isMainWindow
  && hasSameOrigin(input.requestingUrl, input.trustedOrigin);

export const hasSameOrigin = (value: string, expected: string) => {
  try {
    return new URL(value).origin === new URL(expected).origin;
  } catch {
    return false;
  }
};
