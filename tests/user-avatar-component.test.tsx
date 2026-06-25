import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserAvatar } from '../web/src/user-avatars/UserAvatar.js';

test('user avatar renders custom images when external avatars are disabled', () => {
  const markup = renderToStaticMarkup(
    <UserAvatar
      customAvatarUrl="data:image/png;base64,custom"
      enabled={false}
      user={{
        account: null,
        host: null,
        nick: 'Sofia',
        username: null,
      }}
    />,
  );

  assert.match(markup, /src="data:image\/png;base64,custom"/);
  assert.doesNotMatch(markup, /avatar-redirect/);
});
