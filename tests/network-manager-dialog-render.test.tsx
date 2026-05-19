import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NetworkProfile } from '../shared/protocol-chat.js';
import { NetworkManagerListRow } from '../web/src/network-manager-dialog-sections.js';

const network = (overrides: Partial<NetworkProfile> = {}): NetworkProfile => ({
  id: 'network-1',
  workspaceOpen: false,
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

test('network manager rows use IRCCloud avatar fallbacks when enabled', () => {
  const markup = renderToStaticMarkup(
    <NetworkManagerListRow
      externalAvatarsEnabled
      network={network({ username: 'uid7' })}
      selected={false}
      runtime={null}
      onSelect={() => undefined}
    />,
  );

  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /data-network-image-source="irccloud-fallback"/);
});

test('network manager rows keep generated icons when external avatars are disabled', () => {
  const markup = renderToStaticMarkup(
    <NetworkManagerListRow
      externalAvatarsEnabled={false}
      network={network({ username: 'uid7' })}
      selected={false}
      runtime={null}
      onSelect={() => undefined}
    />,
  );

  assert.doesNotMatch(markup, /avatar-redirect/);
  assert.doesNotMatch(markup, /data-network-image-source="irccloud-fallback"/);
});
