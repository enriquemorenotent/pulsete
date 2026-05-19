import assert from 'node:assert/strict';
import test from 'node:test';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import {
  resolveNetworkServerImage,
  resolveNetworkServerImageUrl,
} from '../web/src/network-server-image.js';

const network = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: 'network-1',
  workspaceOpen: true,
  name: 'Cuff-Link',
  host: 'irc.example.test',
  port: 6697,
  tls: true,
  nick: 'sofia',
  username: overrides.username,
  iconUrl: overrides.iconUrl,
  altNicks: [],
  realName: 'Sofia',
  hasPassword: false,
  favorite: false,
  autoJoin: [],
});

test('network server image uses the explicit saved image first', () => {
  const explicitImage = resolveNetworkServerImage(
    network({
      iconUrl: ' https://example.test/server.png ',
      username: 'uid7',
    }),
    true,
  );

  assert.deepEqual(explicitImage, {
    source: 'explicit',
    url: 'https://example.test/server.png',
  });
  assert.equal(
    resolveNetworkServerImageUrl(
      network({
        iconUrl: ' https://example.test/server.png ',
        username: 'uid7',
      }),
      true,
    ),
    'https://example.test/server.png',
  );
});

test('network server image falls back to IRCCloud identity avatars when enabled', () => {
  assert.deepEqual(
    resolveNetworkServerImage(network({ username: 'uid7' }), true),
    {
      source: 'irccloud-fallback',
      url: 'https://static.irccloud-cdn.com/avatar-redirect/7',
    },
  );
  assert.equal(
    resolveNetworkServerImageUrl(network({ username: 'uid7' }), true),
    'https://static.irccloud-cdn.com/avatar-redirect/7',
  );
});

test('network server image does not load IRCCloud avatars when external avatars are disabled', () => {
  assert.equal(resolveNetworkServerImageUrl(network({ username: 'uid7' }), false), null);
});
