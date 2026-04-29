import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasStoredComposerDraft,
  initialComposerDraftState,
  initialComposerHistoryState,
  pruneComposerDraftContexts,
  pushComposerHistoryEntryForContext,
  pushComposerHistoryEntry,
  readComposerDraft,
  setComposerDraftForContext,
  stepComposerHistoryForContext,
  stepComposerHistory,
} from '../web/src/composer-history.js';

test('older history recalls the latest submitted entry first', () => {
  const state = pushComposerHistoryEntry(
    pushComposerHistoryEntry(initialComposerHistoryState, 'hello'),
    '/join #help',
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
    'second',
  );
  const older = stepComposerHistory(state, 'older', 'typing now');
  const newer = older
    ? stepComposerHistory(older.state, 'newer', older.draft)
    : null;

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
    'second',
  );
  const older = stepComposerHistory(state, 'older', '');
  const oldest = older
    ? stepComposerHistory(older.state, 'older', older.draft)
    : null;

  assert.deepEqual(oldest?.draft, 'first');
  assert.equal(oldest?.state.index, 0);
});

test('blank submissions are not added to history', () => {
  const state = pushComposerHistoryEntry(initialComposerHistoryState, '   ');

  assert.deepEqual(state, initialComposerHistoryState);
});

test('composer drafts stay isolated per buffer context', () => {
  let state = setComposerDraftForContext(
    initialComposerDraftState,
    'buffer-1',
    'hello there',
  );
  state = setComposerDraftForContext(state, 'buffer-2', '/join #help');

  assert.equal(readComposerDraft(state, 'buffer-1'), 'hello there');
  assert.equal(readComposerDraft(state, 'buffer-2'), '/join #help');
  assert.equal(hasStoredComposerDraft(state, 'buffer-1'), true);
  assert.equal(hasStoredComposerDraft(state, 'missing'), false);
});

test('history recall only updates the active buffer context', () => {
  let state = pushComposerHistoryEntryForContext(
    initialComposerDraftState,
    'buffer-1',
    'first',
  );
  state = pushComposerHistoryEntryForContext(state, 'buffer-1', 'second');
  state = setComposerDraftForContext(state, 'buffer-1', 'typing one');
  state = setComposerDraftForContext(state, 'buffer-2', 'typing two');

  state = stepComposerHistoryForContext(state, 'buffer-1', 'older');
  assert.equal(readComposerDraft(state, 'buffer-1'), 'second');
  assert.equal(readComposerDraft(state, 'buffer-2'), 'typing two');

  state = stepComposerHistoryForContext(state, 'buffer-1', 'newer');
  assert.equal(readComposerDraft(state, 'buffer-1'), 'typing one');
  assert.equal(readComposerDraft(state, 'buffer-2'), 'typing two');
});

test('composer draft contexts are pruned when buffers disappear', () => {
  let state = setComposerDraftForContext(
    initialComposerDraftState,
    'buffer-1',
    'keep me',
  );
  state = pushComposerHistoryEntryForContext(state, 'buffer-2', '/join #stale');
  state = setComposerDraftForContext(state, 'buffer-3', 'also stale');

  const pruned = pruneComposerDraftContexts(state, ['buffer-1']);

  assert.equal(readComposerDraft(pruned, 'buffer-1'), 'keep me');
  assert.equal(readComposerDraft(pruned, 'buffer-2'), '');
  assert.equal(readComposerDraft(pruned, 'buffer-3'), '');
  assert.deepEqual(Object.keys(pruned), ['buffer-1']);
});
