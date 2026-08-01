import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryAvatarOptionsMenu } from '../web/src/QueryAvatarOptionsMenu.js';
import { AvatarOverridesProvider } from '../web/src/user-avatars/query-overrides.js';

const user = { nick: 'Sofia', username: 'uid7', host: null };

const renderOptions = (input: {
  externalAvatarsEnabled: boolean;
  failedAvatarUrl?: string | null;
  customAvatarUrl?: string | null;
}) => renderToStaticMarkup(
  <AvatarOverridesProvider
    overrides={input.customAvatarUrl ? [{
      id: 'avatar-1',
      networkId: 'network-1',
      nick: user.nick,
      identity: { kind: 'nick', value: user.nick },
      imageUrl: input.customAvatarUrl,
      updatedAt: 1,
    }] : []}
    onRemove={() => undefined}
    onSave={() => undefined}
  >
    <QueryAvatarOptionsMenu
      externalAvatarsEnabled={input.externalAvatarsEnabled}
      failedAvatarUrl={input.failedAvatarUrl}
      networkId="network-1"
      user={user}
    />
  </AvatarOverridesProvider>,
);

test('avatar options show a neutral initial source cue', () => {
  const markup = renderOptions({ externalAvatarsEnabled: false });

  assert.match(markup, /data-avatar-source="initial"/);
  assert.match(markup, /aria-description="Avatar source: Initial fallback"/);
  assert.match(markup, /lucide-case-upper/);
});

test('avatar options show a blue IRCCloud source cue', () => {
  const markup = renderOptions({ externalAvatarsEnabled: true });

  assert.match(markup, /data-avatar-source="irccloud"/);
  assert.match(markup, /aria-description="Avatar source: IRCCloud"/);
  assert.match(markup, /lucide-cloud/);
});

test('avatar options prefer the custom source cue', () => {
  const markup = renderOptions({
    customAvatarUrl: 'data:image/png;base64,custom',
    externalAvatarsEnabled: true,
  });

  assert.match(markup, /data-avatar-source="custom"/);
  assert.match(markup, /aria-description="Avatar source: Custom"/);
  assert.match(markup, /lucide-image/);
});

test('avatar options show the initial cue when the preferred source fails', () => {
  const markup = renderOptions({
    externalAvatarsEnabled: true,
    failedAvatarUrl: 'https://static.irccloud-cdn.com/avatar-redirect/7',
  });

  assert.match(markup, /data-avatar-source="initial"/);
  assert.match(markup, /aria-description="Avatar source: Initial fallback"/);
});
