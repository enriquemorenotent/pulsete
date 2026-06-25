import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandPaletteEntrySpecs } from '../web/src/command-palette.js';
import {
  resolveUserAvatarOverrideKey,
  resolveUserAvatarTarget,
} from '../web/src/user-avatars/override-model.js';
import {
  buildPaletteInput,
  channelBuffer,
  connection,
  network,
  pendingChannel,
  queryBuffer,
  serverBuffer,
} from './helpers/command-palette-fixtures.js';

test('command palette prefers custom avatars for query buffer entries only', () => {
  const iconUrl = 'data:image/png;base64,network';
  const customAvatarUrl = 'data:image/png;base64,query';
  const identity = { kind: 'account' as const, value: 'nathe-account' };
  const target = resolveUserAvatarTarget(network.id, {
    identity,
    nick: queryBuffer.target,
  });
  const avatarKey = resolveUserAvatarOverrideKey(target);
  assert.ok(avatarKey);

  const entries = buildCommandPaletteEntrySpecs(buildPaletteInput({
    connections: [{
      ...connection,
      network: { ...network, iconUrl },
      serverBuffer,
      childBuffers: [
        { buffer: channelBuffer, selected: false },
        { buffer: { ...queryBuffer, peerIdentity: identity }, selected: false },
      ],
      pendingChannels: [{ pendingChannel, selected: false }],
    }],
    userAvatarOverrides: { [avatarKey]: customAvatarUrl },
  }));

  assert.equal(entries.find((entry) => entry.id === `network:${network.id}`)?.networkIconUrl, iconUrl);
  assert.equal(entries.find((entry) => entry.id === `buffer:${channelBuffer.id}`)?.networkIconUrl, iconUrl);
  assert.equal(entries.find((entry) => entry.id === `buffer:${queryBuffer.id}`)?.networkIconUrl, customAvatarUrl);
  assert.equal(
    entries.find((entry) =>
      entry.id === `pending:${pendingChannel.networkId}:${pendingChannel.channel}`)?.networkIconUrl,
    iconUrl,
  );
});
