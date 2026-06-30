import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVER_SIDEBAR_ACCORDION_STORAGE_KEY,
  getServerSidebarAccordionStorageKey,
  isServerSidebarAccordionOpen,
  parseServerSidebarAccordionState,
  persistServerSidebarAccordionState,
  readStoredServerSidebarAccordionState,
} from '../web/src/server-sidebar-accordion-state.js';

test('server sidebar accordion state parses only known boolean sections', () => {
  assert.deepEqual(parseServerSidebarAccordionState(null), {});
  assert.deepEqual(parseServerSidebarAccordionState('not json'), {});
  assert.deepEqual(
    parseServerSidebarAccordionState(JSON.stringify({
      capabilities: false,
      connection: true,
      junk: false,
      notes: 'closed',
    })),
    { capabilities: false, connection: true },
  );
});

test('server sidebar accordion sections default open when no preference exists', () => {
  assert.equal(isServerSidebarAccordionOpen({}, 'connection'), true);
  assert.equal(isServerSidebarAccordionOpen({ history: false }, 'history'), false);
});

test('server sidebar accordion state stores one preference set per server', () => {
  const previousWindow = globalThis.window;
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    },
  });
  try {
    const firstKey = getServerSidebarAccordionStorageKey('network-1');
    const secondKey = getServerSidebarAccordionStorageKey('network-2');
    assert.notEqual(firstKey, secondKey);
    assert.deepEqual(readStoredServerSidebarAccordionState('network-1'), {});
    persistServerSidebarAccordionState('network-1', { capabilities: false, notes: true });
    persistServerSidebarAccordionState('network-2', { history: false });
    assert.equal(
      storage.has(`${SERVER_SIDEBAR_ACCORDION_STORAGE_KEY}.network-1`),
      true,
    );
    assert.deepEqual(
      readStoredServerSidebarAccordionState('network-1'),
      { capabilities: false, notes: true },
    );
    assert.deepEqual(readStoredServerSidebarAccordionState('network-2'), { history: false });
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});
