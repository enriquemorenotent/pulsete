import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasSameOrigin,
  isTrustedNotificationPermission,
} from '../desktop/notification-permissions.js';

test('desktop grants notifications only to the main Pulsete origin', () => {
  const trustedOrigin = 'http://127.0.0.1:18487';
  assert.equal(isTrustedNotificationPermission({
    isMainFrame: true,
    isMainWindow: true,
    permission: 'notifications',
    requestingUrl: `${trustedOrigin}/settings`,
    trustedOrigin,
  }), true);
  assert.equal(isTrustedNotificationPermission({
    isMainFrame: true,
    isMainWindow: false,
    permission: 'notifications',
    requestingUrl: trustedOrigin,
    trustedOrigin,
  }), false);
  assert.equal(isTrustedNotificationPermission({
    isMainFrame: true,
    isMainWindow: true,
    permission: 'media',
    requestingUrl: trustedOrigin,
    trustedOrigin,
  }), false);
  assert.equal(isTrustedNotificationPermission({
    isMainFrame: true,
    isMainWindow: true,
    permission: 'notifications',
    requestingUrl: 'http://127.0.0.1:9999',
    trustedOrigin,
  }), false);
  assert.equal(isTrustedNotificationPermission({
    isMainFrame: false,
    isMainWindow: true,
    permission: 'notifications',
    requestingUrl: trustedOrigin,
    trustedOrigin,
  }), false);
});

test('desktop origin checks reject malformed URLs and port changes', () => {
  assert.equal(hasSameOrigin('not a url', 'http://127.0.0.1:18487'), false);
  assert.equal(
    hasSameOrigin('http://127.0.0.1:18487/chat', 'http://127.0.0.1:18487'),
    true,
  );
  assert.equal(
    hasSameOrigin('http://127.0.0.1:18488', 'http://127.0.0.1:18487'),
    false,
  );
});
