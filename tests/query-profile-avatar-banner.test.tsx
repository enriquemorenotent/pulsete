import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BufferState } from '../shared/protocol-chat.js';
import { QueryProfileSidebar } from '../web/src/QueryProfileSidebar.js';

const queryBuffer: BufferState = {
  id: 'query-buffer-1',
  networkId: 'network-1',
  kind: 'query',
  target: 'Sofia',
  notes: '',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

test('query avatar banner marks IRCCloud avatars with a source cue', () => {
  const markup = renderToStaticMarkup(
    <QueryProfileSidebar
      avatarUser={{ nick: 'Sofia', username: 'uid7', host: null }}
      buffer={queryBuffer}
      externalAvatarsEnabled
      onSaveNotes={async () => queryBuffer}
    />,
  );

  assert.match(markup, /aria-label="Avatar for Sofia"/);
  assert.match(markup, /src="https:\/\/static\.irccloud-cdn\.com\/avatar-redirect\/7"/);
  assert.match(markup, /title="IRCCloud avatar"/);
  assert.match(markup, /title="Choose custom avatar"/);
});

test('query avatar banner prefers custom overrides with a source cue', () => {
  const markup = renderToStaticMarkup(
    <QueryProfileSidebar
      avatarUser={{ nick: 'Sofia', username: 'uid7', host: null }}
      buffer={queryBuffer}
      customAvatarUrl="data:image/png;base64,custom"
      externalAvatarsEnabled
      onSetCustomAvatarUrl={() => undefined}
      onSaveNotes={async () => queryBuffer}
    />,
  );

  assert.match(markup, /aria-label="Custom avatar for Sofia"/);
  assert.match(markup, /src="data:image\/png;base64,custom"/);
  assert.match(markup, /title="Custom avatar"/);
  assert.match(markup, /title="Choose custom avatar"/);
  assert.match(markup, /title="Use original avatar"/);
  assert.doesNotMatch(markup, /avatar-redirect\/7/);
});
