import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContactSettingsDialogBody } from '../web/src/ContactSettingsDialog.js';

test('contact settings body renders the combined contact rule toggles', () => {
  const markup = renderToStaticMarkup(
    <ContactSettingsDialogBody
      friend={true}
      notifications={false}
      muted={true}
      onFriendChange={() => undefined}
      onNotificationsChange={() => undefined}
      onMutedChange={() => undefined}
    />,
  );

  assert.match(markup, />Friend</);
  assert.match(markup, />Notifications</);
  assert.match(markup, />Muted</);
  assert.match(markup, /aria-checked="true"[\s\S]*>Friend</);
  assert.match(markup, /aria-checked="false"[\s\S]*>Notifications</);
  assert.match(markup, /aria-checked="true"[\s\S]*>Muted</);
});
