import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleDesktopNavigationCommand,
  restrictDesktopNavigationToOrigin,
} from '../desktop/navigation-history.js';

test('desktop mouse navigation uses available back and forward history', () => {
  const calls: string[] = [];
  const history = {
    canGoBack: () => true,
    canGoForward: () => true,
    goBack: () => calls.push('back'),
    goForward: () => calls.push('forward'),
  };

  assert.equal(
    handleDesktopNavigationCommand('browser-backward', history),
    true,
  );
  assert.equal(
    handleDesktopNavigationCommand('browser-forward', history),
    true,
  );
  assert.deepEqual(calls, ['back', 'forward']);
});

test('desktop mouse navigation ignores unavailable or unrelated commands', () => {
  const calls: string[] = [];
  const history = {
    canGoBack: () => false,
    canGoForward: () => false,
    goBack: () => calls.push('back'),
    goForward: () => calls.push('forward'),
  };

  assert.equal(
    handleDesktopNavigationCommand('browser-backward', history),
    false,
  );
  assert.equal(
    handleDesktopNavigationCommand('browser-forward', history),
    false,
  );
  assert.equal(
    handleDesktopNavigationCommand('copy', history),
    false,
  );
  assert.deepEqual(calls, []);
});

test('desktop mouse navigation stays inside the Pulsete origin', () => {
  const calls: string[] = [];
  let activeIndex = 1;
  const entries = [
    { url: 'about:blank' },
    { url: 'http://127.0.0.1:18487/' },
    { url: 'http://127.0.0.1:18487/' },
  ];
  const history = restrictDesktopNavigationToOrigin({
    canGoBack: () => activeIndex > 0,
    canGoForward: () => activeIndex < entries.length - 1,
    canGoToOffset: (offset) => {
      const nextIndex = activeIndex + offset;
      return nextIndex >= 0 && nextIndex < entries.length;
    },
    getActiveIndex: () => activeIndex,
    getEntryAtIndex: (index) => entries[index] ?? null,
    goBack: () => {
      activeIndex -= 1;
      calls.push('back');
    },
    goForward: () => {
      activeIndex += 1;
      calls.push('forward');
    },
  }, 'http://127.0.0.1:18487/');

  assert.equal(
    handleDesktopNavigationCommand('browser-backward', history),
    false,
  );
  assert.equal(
    handleDesktopNavigationCommand('browser-forward', history),
    true,
  );
  assert.equal(
    handleDesktopNavigationCommand('browser-backward', history),
    true,
  );
  assert.deepEqual(calls, ['forward', 'back']);
});
