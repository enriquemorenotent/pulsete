import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installLaunchAuthenticationCookie,
  launchSessionPartition,
  type LaunchCookieDetails,
} from '../desktop/launch-authentication.js';

test('desktop installs the launch credential as an HttpOnly in-memory session cookie', async () => {
  let installed: LaunchCookieDetails | null = null;
  await installLaunchAuthenticationCookie({
    cookies: {
      async set(details) {
        installed = details;
      },
    },
  }, {
    getAuthenticationCookie: () => ({
      name: 'pulsete_launch',
      value: 'launch-credential',
    }),
    url: 'http://127.0.0.1:18487',
  });

  assert.equal(launchSessionPartition.startsWith('persist:'), false);
  assert.deepEqual(installed, {
    httpOnly: true,
    name: 'pulsete_launch',
    path: '/',
    sameSite: 'strict',
    secure: false,
    url: 'http://127.0.0.1:18487',
    value: 'launch-credential',
  });
  assert.equal('expirationDate' in (installed as unknown as Record<string, unknown>), false);
});
