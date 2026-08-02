import assert from 'node:assert/strict';
import test from 'node:test';
import { createNetworkInput } from './helpers/http-server-helpers.js';
import { requestJson } from './helpers/http-request-helpers.js';
import { createHttpRuntimeContext } from './helpers/http-runtime-test-helpers.js';
import { waitForWebSocketMessageType } from './helpers/http-websocket-test-helpers.js';

const pngDataUrl = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]).toString('base64')}`;

test('preference and draft routes persist changes and broadcast snapshots', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  try {
    const network = context.storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
    const query = context.storage.conversations.upsertQuery(network.id, 'Alice');
    assert.ok(context.socket);

    const preferenceMessage = waitForWebSocketMessageType(context.socket, 'preferences.updated');
    const preferenceResponse = await requestJson(
      context.port,
      'PATCH',
      '/api/preferences',
      {
        aiAssistant: {
          model: 'gpt-5.6-luna',
          reasoningEffort: 'max',
        },
        hideOfflineFriends: true,
        leftSidebarWidth: 318,
        rightSidebarWidth: 346,
      },
    );
    const preferenceBroadcast = await preferenceMessage;

    assert.equal(preferenceResponse.status, 200);
    assert.equal(
      (preferenceResponse.json.preferences as { hideOfflineFriends: boolean }).hideOfflineFriends,
      true,
    );
    assert.equal(
      (preferenceBroadcast.preferences as { rightSidebarWidth: number }).rightSidebarWidth,
      346,
    );
    assert.deepEqual(
      (preferenceResponse.json.preferences as {
        aiAssistant: { model: string; reasoningEffort: string };
      }).aiAssistant,
      { model: 'gpt-5.6-luna', reasoningEffort: 'max' },
    );

    const upsertMessage = waitForWebSocketMessageType(context.socket, 'draft.upsert');
    const upsertResponse = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${query.id}/draft`,
      { body: 'unfinished reply' },
    );
    await upsertMessage;
    assert.equal(upsertResponse.status, 200);
    assert.equal((upsertResponse.json.draft as { body: string }).body, 'unfinished reply');
    assert.equal(context.storage.drafts.get(query.id)?.body, 'unfinished reply');

    const removeMessage = waitForWebSocketMessageType(context.socket, 'draft.remove');
    const removeResponse = await requestJson(
      context.port,
      'PUT',
      `/api/buffers/${query.id}/draft`,
      { body: '' },
    );
    await removeMessage;
    assert.equal(removeResponse.status, 200);
    assert.equal(removeResponse.json.draft, null);
    assert.equal(context.storage.drafts.get(query.id), null);

    const missing = await requestJson(
      context.port,
      'PUT',
      '/api/buffers/missing/draft',
      { body: 'lost' },
    );
    assert.equal(missing.status, 404);
  } finally {
    await context.close();
  }
});

test('avatar routes validate image content, serve blobs, and broadcast removal', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  try {
    const network = context.storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
    assert.ok(context.socket);

    const upsertMessage = waitForWebSocketMessageType(context.socket, 'avatar-override.upsert');
    const response = await requestJson(
      context.port,
      'PUT',
      '/api/user-avatar-overrides',
      {
        dataUrl: pngDataUrl,
        identity: { kind: 'account', value: 'alice-account' },
        networkId: network.id,
        nick: 'Alice',
      },
    );
    await upsertMessage;
    const avatar = response.json.avatarOverride as { id: string; imageUrl: string };
    assert.equal(response.status, 200);
    assert.match(avatar.imageUrl, /^\/api\/user-avatar-overrides\/.+\/image\?v=/);

    const imageResponse = await fetch(`http://127.0.0.1:${context.port}${avatar.imageUrl}`);
    const etag = imageResponse.headers.get('etag');
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]));
    assert.ok(etag);

    const cached = await fetch(`http://127.0.0.1:${context.port}${avatar.imageUrl}`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(cached.status, 304);

    const mismatch = await requestJson(
      context.port,
      'PUT',
      '/api/user-avatar-overrides',
      {
        dataUrl: `data:image/png;base64,${Buffer.from('GIF89a').toString('base64')}`,
        networkId: network.id,
        nick: 'Mallory',
      },
    );
    assert.equal(mismatch.status, 400);

    const removeMessage = waitForWebSocketMessageType(context.socket, 'avatar-override.remove');
    const removed = await requestJson(
      context.port,
      'DELETE',
      `/api/user-avatar-overrides/${avatar.id}`,
    );
    await removeMessage;
    assert.equal(removed.status, 200);
    assert.deepEqual(context.storage.avatarOverrides.list(), []);
  } finally {
    await context.close();
  }
});

test('legacy browser import is one-time and skips avatar records for deleted networks', async () => {
  const context = await createHttpRuntimeContext({ websocket: true });
  try {
    const network = context.storage.networks.upsert(createNetworkInput({ workspaceOpen: true }));
    assert.ok(context.socket);
    const completedMessage = waitForWebSocketMessageType(
      context.socket,
      'browser-storage-import.completed',
    );
    const first = await requestJson(
      context.port,
      'POST',
      '/api/preferences/import-legacy',
      {
        preferences: { hideOfflineFriends: true },
        avatarOverrides: [
          { dataUrl: pngDataUrl, networkId: network.id, nick: 'Alice' },
          { dataUrl: pngDataUrl, networkId: 'deleted-network', nick: 'Ghost' },
          {
            dataUrl: 'data:image/png;base64,bm90LWEtcG5n',
            networkId: network.id,
            nick: 'Broken',
          },
        ],
      },
    );
    await completedMessage;

    assert.equal(first.status, 200);
    assert.equal(first.json.imported, true);
    assert.equal(first.json.skippedAvatarOverrides, 2);
    assert.equal(context.storage.preferences.get().hideOfflineFriends, true);
    assert.equal(context.storage.avatarOverrides.list().length, 1);
    assert.equal(context.storage.preferences.isLegacyBrowserImportPending(), false);

    const second = await requestJson(
      context.port,
      'POST',
      '/api/preferences/import-legacy',
      {
        preferences: { hideOfflineFriends: false },
        avatarOverrides: [],
      },
    );
    assert.equal(second.status, 200);
    assert.equal(second.json.imported, false);
    assert.deepEqual(second.json.messages, []);
    assert.equal(context.storage.preferences.get().hideOfflineFriends, true);
  } finally {
    await context.close();
  }
});
