import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryProfileAvatarBanner } from '../web/src/QueryProfileAvatarBanner.js';

test('query avatar banner renders IRCCloud avatars as a clean preview target', () => {
  const markup = renderToStaticMarkup(
    <QueryProfileAvatarBanner
      enabled
      networkId="network-1"
      user={{ nick: 'Sofia', username: 'uid7', host: null }}
      variant="compact"
    />,
  );

  assert.match(markup, /aria-label="Avatar for Sofia"/);
  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /aria-label="Avatar for Sofia"/);
  assert.doesNotMatch(markup, /title="IRCCloud avatar"/);
  assert.doesNotMatch(markup, /title="Choose custom avatar"/);
});

test('query avatar banner prefers custom overrides without edit controls', () => {
  const markup = renderToStaticMarkup(
    <QueryProfileAvatarBanner
      customAvatarUrl="data:image/png;base64,custom"
      enabled
      networkId="network-1"
      user={{ nick: 'Sofia', username: 'uid7', host: null }}
      variant="compact"
    />,
  );

  assert.match(markup, /aria-label="Custom avatar for Sofia"/);
  assert.match(markup, /src="data:image\/png;base64,custom"/);
  assert.doesNotMatch(markup, /title="Custom avatar"/);
  assert.doesNotMatch(markup, /title="Choose custom avatar"/);
  assert.doesNotMatch(markup, /title="Use original avatar"/);
  assert.doesNotMatch(markup, /avatar-redirect\/7/);
});

test('topbar avatars do not draw a divider beside the name', () => {
  const imageMarkup = renderToStaticMarkup(
    <QueryProfileAvatarBanner
      enabled
      networkId="network-1"
      user={{ nick: 'Sofia', username: 'uid7', host: null }}
      variant="topbar"
    />,
  );
  const initialMarkup = renderToStaticMarkup(
    <QueryProfileAvatarBanner
      enabled={false}
      networkId="network-1"
      user={{ nick: 'Sofia', username: null, host: null }}
      variant="topbar"
    />,
  );

  assert.doesNotMatch(imageMarkup, /\bborder-r\b/);
  assert.doesNotMatch(initialMarkup, /\bborder-r\b/);
  assert.match(imageMarkup, /\bsize-15\b/);
  assert.match(initialMarkup, /\bsize-15\b/);
});
