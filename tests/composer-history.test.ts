import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialComposerHistoryState,
  pushComposerHistoryEntry,
  stepComposerHistory,
} from '../web/src/composer-history.js';

test('older history recalls the latest submitted entry first', () => {
  const state = pushComposerHistoryEntry(
    pushComposerHistoryEntry(initialComposerHistoryState, 'hello'),
    '/join #help'
  );

  const older = stepComposerHistory(state, 'older', '');

  assert.deepEqual(older, {
    state: {
      entries: ['hello', '/join #help'],
      index: 1,
      draftBeforeNavigation: '',
    },
    draft: '/join #help',
  });
});

test('newer history restores the draft from before navigation', () => {
  const state = pushComposerHistoryEntry(
    pushComposerHistoryEntry(initialComposerHistoryState, 'first'),
    'second'
  );
  const older = stepComposerHistory(state, 'older', 'typing now');
  const newer = older ? stepComposerHistory(older.state, 'newer', older.draft) : null;

  assert.deepEqual(newer, {
    state: {
      entries: ['first', 'second'],
      index: null,
      draftBeforeNavigation: '',
    },
    draft: 'typing now',
  });
});

test('history navigation clamps at the oldest entry', () => {
  const state = pushComposerHistoryEntry(
    pushComposerHistoryEntry(initialComposerHistoryState, 'first'),
    'second'
  );
  const older = stepComposerHistory(state, 'older', '');
  const oldest = older ? stepComposerHistory(older.state, 'older', older.draft) : null;

  assert.deepEqual(oldest?.draft, 'first');
  assert.equal(oldest?.state.index, 0);
});

test('blank submissions are not added to history', () => {
  const state = pushComposerHistoryEntry(initialComposerHistoryState, '   ');

  assert.deepEqual(state, initialComposerHistoryState);
});
