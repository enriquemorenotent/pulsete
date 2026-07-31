import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { BufferState } from '../shared/protocol-chat.js';
import {
  CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY,
} from '../web/src/contact-notifications/settings.js';
import { MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY } from '../web/src/media-visibility-settings.js';
import {
  buildLegacyImportPayload,
  importCurrentBrowserStorage,
} from '../web/src/legacy-browser-storage-import.js';
import {
  SERVER_SIDEBAR_ACCORDION_STORAGE_KEY,
} from '../web/src/server-sidebar-accordion-state.js';
import {
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '../web/src/sidebar-width.js';
import { HIDE_OFFLINE_FRIENDS_STORAGE_KEY } from '../web/src/useAppUiState.js';
import {
  QUERY_AVATAR_OVERRIDES_STORAGE_KEY,
  resolveUserAvatarOverrideKey,
  USER_AVATAR_OVERRIDES_STORAGE_KEY,
} from '../web/src/user-avatars/override-model.js';
import { USER_AVATAR_SETTINGS_STORAGE_KEY } from '../web/src/user-avatars/settings.js';

const makeQuery = (input: {
  id: string;
  nick: string;
  identity?: BufferState['peerIdentity'];
}): BufferState => ({
  id: input.id,
  networkId: 'network-1',
  kind: 'query',
  target: input.nick,
  peerIdentity: input.identity,
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
});

test('legacy browser preferences convert into one durable import payload', () => {
  const alice = makeQuery({
    id: 'query-alice',
    nick: 'Alice',
    identity: { kind: 'account', value: 'alice-account' },
  });
  const bob = makeQuery({ id: 'query-bob', nick: 'Bob' });
  const aliceKey = resolveUserAvatarOverrideKey({
    networkId: alice.networkId,
    nick: alice.target,
    identity: alice.peerIdentity,
  });
  assert.ok(aliceKey);

  const payload = buildLegacyImportPayload({
    [CONTACT_NOTIFICATION_SETTINGS_STORAGE_KEY]: JSON.stringify({
      enabled: true,
      systemEnabled: true,
      sound: 'bell',
      contacts: [{ networkId: 'network-1', nick: 'Alice' }],
      channels: [{ networkId: 'network-1', channel: '#help' }],
    }),
    [MEDIA_VISIBILITY_SETTINGS_STORAGE_KEY]: JSON.stringify({ mode: 'hide-media' }),
    [USER_AVATAR_SETTINGS_STORAGE_KEY]: JSON.stringify({ externalAvatarsEnabled: true }),
    [HIDE_OFFLINE_FRIENDS_STORAGE_KEY]: 'true',
    [SIDEBAR_WIDTH_STORAGE_KEY]: '312',
    [RIGHT_SIDEBAR_WIDTH_STORAGE_KEY]: '344',
    [`${SERVER_SIDEBAR_ACCORDION_STORAGE_KEY}.network-1`]: JSON.stringify({ notes: false }),
    [USER_AVATAR_OVERRIDES_STORAGE_KEY]: JSON.stringify({
      [aliceKey]: 'https://example.test/alice.png',
    }),
    [QUERY_AVATAR_OVERRIDES_STORAGE_KEY]: JSON.stringify({
      [bob.id]: 'https://example.test/bob.png',
    }),
  }, [alice, bob]);

  assert.deepEqual(payload.preferences, {
    contactNotifications: {
      enabled: true,
      systemEnabled: true,
      sound: 'bell',
      contacts: [{
        identity: { kind: 'nick', value: 'alice' },
        networkId: 'network-1',
        nick: 'Alice',
      }],
      channels: [{ networkId: 'network-1', channel: '#help' }],
    },
    mediaVisibilityMode: 'hide-media',
    externalAvatarsEnabled: true,
    hideOfflineFriends: true,
    leftSidebarWidth: 312,
    rightSidebarWidth: 344,
    serverSidebarAccordions: { 'network-1': { notes: false } },
  });
  assert.deepEqual(payload.avatarOverrides, [
    {
      networkId: 'network-1',
      nick: 'Alice',
      identity: { kind: 'account', value: 'alice-account' },
      externalUrl: 'https://example.test/alice.png',
    },
    {
      networkId: 'network-1',
      nick: 'Bob',
      identity: undefined,
      externalUrl: 'https://example.test/bob.png',
    },
  ]);
});

test('browser keys are cleared only after the durable import succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const storage = createMemoryLocalStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
  try {
    storage.setItem(HIDE_OFFLINE_FRIENDS_STORAGE_KEY, 'true');
    storage.setItem('other.setting', 'keep');
    const applied: string[] = [];
    globalThis.fetch = (async () => new Response(JSON.stringify({
      avatarOverrides: [],
      imported: true,
      messages: [{ type: 'browser-storage-import.completed' }],
      preferences: {},
      skippedAvatarOverrides: 0,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    await importCurrentBrowserStorage([], (messages) => {
      applied.push(...messages.map((message) => message.type));
    });
    assert.equal(storage.getItem(HIDE_OFFLINE_FRIENDS_STORAGE_KEY), null);
    assert.equal(storage.getItem('other.setting'), 'keep');
    assert.deepEqual(applied, ['browser-storage-import.completed']);

    storage.setItem(HIDE_OFFLINE_FRIENDS_STORAGE_KEY, 'true');
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ message: 'failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;
    await assert.rejects(
      importCurrentBrowserStorage([], () => undefined),
      /failed/,
    );
    assert.equal(storage.getItem(HIDE_OFFLINE_FRIENDS_STORAGE_KEY), 'true');
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  }
});

test('browser storage access is isolated to the one-time migration module', () => {
  const sourceRoot = fileURLToPath(new URL('../web/src/', import.meta.url));
  const files = listSourceFiles(sourceRoot);
  const users = files
    .filter((path) => readFileSync(path, 'utf8').includes('localStorage'))
    .map((path) => relative(sourceRoot, path));

  assert.deepEqual(users, ['legacy-browser-storage-import.ts']);
});

const createMemoryLocalStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
};

const listSourceFiles = (directory: string): string[] => readdirSync(
  directory,
  { withFileTypes: true },
).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? listSourceFiles(path) : [path];
}).filter((path) => /\.[cm]?[jt]sx?$/.test(path));
