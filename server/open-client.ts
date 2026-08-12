import { spawn } from 'node:child_process';

const clientWaitTimeoutMs = 60_000;

export const openClientInDefaultBrowser = async (url: string) => {
  if (!await waitForClientOrigin(url)) {
    return;
  }
  const command = browserCommand(url);
  const child = spawn(command.executable, command.arguments, {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    // The server remains available if this system has no default-browser launcher.
  });
  child.unref();
};

const waitForClientOrigin = async (url: string) => {
  const origin = new URL(url).origin;
  const deadline = Date.now() + clientWaitTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { method: 'HEAD' });
      if (response.ok) {
        return true;
      }
    } catch {
      // The development web server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

const browserCommand = (url: string) => {
  if (process.platform === 'darwin') {
    return { executable: 'open', arguments: [url] };
  }
  if (process.platform === 'win32') {
    return { executable: 'cmd', arguments: ['/c', 'start', '', url] };
  }
  return { executable: 'xdg-open', arguments: [url] };
};
