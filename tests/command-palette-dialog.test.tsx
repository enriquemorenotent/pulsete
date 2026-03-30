import assert from 'node:assert/strict';
import test from 'node:test';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandPaletteDialogBody } from '../web/src/CommandPaletteDialog.js';
import type { CommandPaletteEntry } from '../web/src/command-palette.js';
import { Dialog } from '../web/src/components/ui/dialog.js';

const entries: CommandPaletteEntry[] = [{
  id: 'buffer-1',
  section: 'buffers',
  label: '#School-of-O',
  subtitle: 'Cuff-Link (cubanita) (cubanita)',
  keywords: ['school'],
  badge: 'channel',
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
  assert.match(markup, /aria-label="Search command palette"/);
  assert.match(markup, /class="relative overflow-hidden min-h-0 flex-1"/);
  assert.match(markup, /#School-of-O/);
});
