import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandPaletteEntryImage } from '../web/src/CommandPaletteEntryImage.js';
import { CommandPaletteDialogBody } from '../web/src/CommandPaletteDialog.js';
import type { CommandPaletteEntry } from '../web/src/command-palette.js';
import { Dialog } from '../web/src/components/ui/dialog.js';

const entries: CommandPaletteEntry[] = [{
  id: 'buffer-unread',
  section: 'unread',
  label: '#ops',
  networkIconUrl: 'data:image/png;base64,cHVsc2V0ZQ==',
  networkRuntimePhase: 'offline',
  subtitle: 'Cuff-Link (cubanita)',
  keywords: ['ops'],
  badge: 'channel',
  ranking: {
    currentNetwork: true,
    priorityUnread: 1,
    selected: false,
    unread: 3,
  },
  onSelect: () => undefined,
}, {
  id: 'buffer-1',
  section: 'friends',
  label: 'School-of-O',
  emoji: '🌙',
  subtitle: 'Cuff-Link (cubanita) (cubanita)',
  keywords: ['school'],
  badge: 'watchlist',
  ranking: {
    currentNetwork: true,
    priorityUnread: 0,
    selected: false,
    unread: 0,
  },
  onSelect: () => undefined,
}];

test('command palette body keeps the top chrome fixed above a flexible results pane', () => {
  const markup = renderToStaticMarkup(
    <Dialog open>
      <CommandPaletteDialogBody
        activeIndex={0}
        filteredEntries={entries}
        inputRef={createRef<HTMLInputElement>()}
        onClose={() => undefined}
        onQueryChange={() => undefined}
        onQueryKeyDown={() => undefined}
        onSetActiveIndex={() => undefined}
        query="schoo"
      />
    </Dialog>
  );

  assert.match(markup, /class="flex h-full min-h-0 flex-col"/);
  assert.match(markup, /class="shrink-0 border-b border-border px-4 py-3"/);
  assert.match(markup, /Search Pulsete/);
  assert.match(markup, /aria-label="Search command palette"/);
  assert.match(markup, /Search channels, people, logs, networks, actions/);
  assert.match(markup, /class="relative overflow-hidden min-h-0 flex-1"/);
  assert.match(markup, /Unread/);
  assert.match(
    markup,
    /<img src="data:image\/png;base64,cHVsc2V0ZQ==" alt="" class="size-full object-cover grayscale opacity-60"/,
  );
  assert.match(
    markup,
    /<span aria-hidden="true" class="shrink-0 rounded-full size-2\.5 bg-primary ring-2 ring-primary\/25"><\/span><span class="truncate">#ops<\/span>/,
  );
  assert.match(markup, /School-of-O/);
  assert.match(
    markup,
    /<span class="truncate">School-of-O<\/span><span aria-hidden="true" class="shrink-0 text-\[15px\] leading-5">🌙<\/span>/,
  );
});

test('command palette marks fallback network images', () => {
  const markup = renderToStaticMarkup(
    <Dialog open>
      <CommandPaletteDialogBody
        activeIndex={0}
        filteredEntries={[{
          ...entries[0],
          networkIconSource: 'irccloud-fallback',
          networkIconUrl: 'https://static.irccloud-cdn.com/avatar-redirect/7',
        }]}
        inputRef={createRef<HTMLInputElement>()}
        onClose={() => undefined}
        onQueryChange={() => undefined}
        onQueryKeyDown={() => undefined}
        onSetActiveIndex={() => undefined}
        query=""
      />
    </Dialog>
  );

  assert.match(markup, /data-network-image-source="irccloud-fallback"/);
  assert.match(markup, /title="Using IRCCloud avatar fallback"/);
});


test('palette pictures request their owning account and retry on connection changes', () => {
  const picture = { ...entries[0]!, mediaNetworkId: 'account-two', networkIconUrl: 'https://example.com/avatar.png' };
  const offline = renderToStaticMarkup(<CommandPaletteEntryImage entry={picture} />);
  const connected = renderToStaticMarkup(<CommandPaletteEntryImage entry={{ ...picture, networkRuntimePhase: 'connected' }} />);
  const source = (markup: string) => new URL(/src="([^"]+)"/.exec(markup)![1]!.replaceAll('&amp;', '&'), 'http://localhost');
  assert.equal(source(offline).pathname, '/api/media/resource');
  assert.equal(source(offline).searchParams.get('networkId'), 'account-two');
  assert.equal(source(offline).searchParams.get('url'), picture.networkIconUrl);
  assert.notEqual(source(offline).href, source(connected).href);
});

test('palette pictures show initials without a source badge when no usable image URL exists', () => {
  const markup = renderToStaticMarkup(<CommandPaletteEntryImage entry={{
    ...entries[0]!, networkIconSource: 'irccloud-fallback', networkIconUrl: 'invalid-url',
  }} />);
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /data-network-image-source/);
  assert.match(markup, />OP<\/span>/);
});
