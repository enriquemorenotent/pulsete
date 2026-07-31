import assert from 'node:assert/strict';
import test from 'node:test';
import { Storage } from '../server/storage.js';
import { appSnapshotSchema } from '../shared/protocol-app.js';
import { defaultWorkspacePreferences } from '../shared/protocol-preferences.js';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { makeStorageFile } from './helpers/storage-test-helpers.js';

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test('workspace preferences, drafts, and avatar blobs survive a storage restart', () => {
  const databasePath = makeStorageFile();
  const first = new Storage(databasePath);
  const network = first.networks.upsert(createNetworkInput({
    name: 'DurableNet',
    workspaceOpen: true,
  }));
  const query = first.conversations.upsertQuery(
    network.id,
    'Alice',
    { kind: 'account', value: 'alice-account' },
  );

  const preferences = first.preferences.update({
    contactNotifications: {
      enabled: true,
      systemEnabled: true,
      sound: 'glass',
      contacts: [{
        identity: { kind: 'account', value: 'alice-account' },
        networkId: network.id,
        nick: 'Alice',
      }],
      channels: [{ networkId: network.id, channel: '#help' }],
    },
    externalAvatarsEnabled: true,
    hideOfflineFriends: true,
    leftSidebarWidth: 312,
    mediaVisibilityMode: 'hide-media',
    rightSidebarWidth: 344,
    serverSidebarAccordions: {
      [network.id]: { capabilities: false, notes: true },
    },
  });
  const draft = first.drafts.save(query.id, 'unfinished reply');
  const avatar = first.avatarOverrides.upsert({
    data: pngSignature,
    identity: { kind: 'account', value: 'alice-account' },
    mimeType: 'image/png',
    networkId: network.id,
    nick: 'Alice',
    sourceKind: 'blob',
  });
  first.preferences.markLegacyBrowserImported();
  first.close();

  const reopened = new Storage(databasePath);
  try {
    const snapshot = reopened.snapshot();
    assert.deepEqual(snapshot.preferences, preferences);
    assert.deepEqual(snapshot.drafts, [draft]);
    assert.deepEqual(snapshot.userAvatarOverrides, [avatar]);
    assert.equal(snapshot.browserStorageImportPending, false);
    assert.deepEqual(reopened.avatarOverrides.getSource(avatar.id), {
      data: pngSignature,
      mimeType: 'image/png',
      updatedAt: avatar.updatedAt,
    });
  } finally {
    reopened.close();
  }
});

test('durable user state starts with explicit defaults', () => {
  const storage = new Storage(makeStorageFile());
  try {
    const snapshot = storage.snapshot();
    assert.deepEqual(snapshot.preferences, defaultWorkspacePreferences);
    assert.deepEqual(snapshot.drafts, []);
    assert.deepEqual(snapshot.userAvatarOverrides, []);
    assert.equal(snapshot.browserStorageImportPending, true);
  } finally {
    storage.close();
  }
});

test('older snapshots decode with safe user-state defaults', () => {
  const snapshot = appSnapshotSchema.parse({
    networks: [],
    friends: [],
    friendPresence: {},
    buffers: [],
    channels: [],
    messages: [],
    networkStates: {},
  });

  assert.deepEqual(snapshot.preferences, defaultWorkspacePreferences);
  assert.deepEqual(snapshot.drafts, []);
  assert.deepEqual(snapshot.userAvatarOverrides, []);
  assert.equal(snapshot.browserStorageImportPending, false);
});

test('closed buffers retain drafts while deleted networks cascade user state', () => {
  const storage = new Storage(makeStorageFile());
  try {
    const network = storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
    const query = storage.conversations.upsertQuery(network.id, 'Alice');
    storage.drafts.save(query.id, 'temporary');
    storage.avatarOverrides.upsert({
      externalUrl: 'https://example.test/alice.png',
      networkId: network.id,
      nick: 'Alice',
      sourceKind: 'external',
    });
    storage.preferences.update({
      contactNotifications: {
        enabled: true,
        systemEnabled: false,
        sound: 'chirp',
        contacts: [{ networkId: network.id, nick: 'Alice' }],
        channels: [],
      },
      serverSidebarAccordions: { [network.id]: { history: false } },
    });

    storage.conversations.removeBuffer(query.id);
    assert.equal(storage.drafts.get(query.id)?.body, 'temporary');

    storage.networks.delete(network.id);
    assert.equal(storage.drafts.get(query.id), null);
    assert.deepEqual(storage.avatarOverrides.list(), []);
    assert.deepEqual(storage.preferences.get().contactNotifications.contacts, []);
    assert.deepEqual(storage.preferences.get().serverSidebarAccordions, {});
  } finally {
    storage.close();
  }
});

test('preference writes clamp layout widths and discard missing network references', () => {
  const storage = new Storage(makeStorageFile());
  try {
    const preferences = storage.preferences.update({
      leftSidebarWidth: 10,
      rightSidebarWidth: 10_000,
      contactNotifications: {
        enabled: true,
        systemEnabled: true,
        sound: 'bell',
        contacts: [{ networkId: 'deleted-network', nick: 'Alice' }],
        channels: [{ networkId: 'deleted-network', channel: '#help' }],
      },
      serverSidebarAccordions: {
        'deleted-network': { notes: false },
      },
    });

    assert.equal(preferences.leftSidebarWidth, 208);
    assert.equal(preferences.rightSidebarWidth, 420);
    assert.deepEqual(preferences.contactNotifications.contacts, []);
    assert.deepEqual(preferences.contactNotifications.channels, []);
    assert.deepEqual(preferences.serverSidebarAccordions, {});
  } finally {
    storage.close();
  }
});
