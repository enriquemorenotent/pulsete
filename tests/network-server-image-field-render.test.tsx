import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NetworkServerImageField } from '../web/src/NetworkServerImageField.js';

test('server image field previews IRCCloud fallback images with a source cue', () => {
  const markup = renderToStaticMarkup(
    <NetworkServerImageField
      externalAvatarsEnabled
      username="uid7"
      value=""
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /data-network-image-source="irccloud-fallback"/);
  assert.doesNotMatch(markup, /title="Clear image"/);
});

test('server image field does not mark explicit images as fallback', () => {
  const markup = renderToStaticMarkup(
    <NetworkServerImageField
      externalAvatarsEnabled
      username="uid7"
      value="https://example.test/server.png"
      onChange={() => undefined}
    />,
  );

  assert.match(markup, /src="https:\/\/example\.test\/server\.png"/);
  assert.doesNotMatch(markup, /data-network-image-source="irccloud-fallback"/);
  assert.match(markup, /title="Clear image"/);
});
