import assert from 'node:assert/strict';
import test from 'node:test';
import { slashIrcClientCommandCompletionCandidates } from '../shared/irc-client-command.js';
import { getComposerCompletionResult } from '../web/src/composer-completion.js';

test('completion replaces the word at the caret and cycles forward and backward', () => {
  const initial = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  assert.deepEqual(initial && {
    draft: initial.draft,
    selectionStart: initial.selectionStart,
    selectionEnd: initial.selectionEnd,
  }, {
    draft: 'hello alice world',
    selectionStart: 'hello alice'.length,
    selectionEnd: 'hello alice'.length,
  });

  const next = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: initial?.selectionStart ?? null,
    selectionEnd: initial?.selectionEnd ?? null,
    session: initial?.session ?? null,
  });

  assert.equal(next?.draft, 'hello anna world');

  const previous = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'backward',
    draft: next?.draft ?? '',
    selectionStart: next?.selectionStart ?? null,
    selectionEnd: next?.selectionEnd ?? null,
    session: next?.session ?? null,
  });

  assert.equal(previous?.draft, 'hello alice world');
});

test('backward completion starts from the last matching nick', () => {
  const result = getComposerCompletionResult({
    candidates: ['alice', 'anna', 'avery'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'backward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  assert.equal(result?.draft, 'hello avery world');
});

test('command completion expands the first slash token to canonical command names', () => {
  const query = getComposerCompletionResult({
    candidates: ['alice'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: '/q',
    selectionStart: '/q'.length,
    selectionEnd: '/q'.length,
    session: null,
  });

  assert.equal(query?.draft, '/query');

  const join = getComposerCompletionResult({
    candidates: ['alice'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: '/jo #help',
    selectionStart: '/jo'.length,
    selectionEnd: '/jo'.length,
    session: null,
  });

  assert.equal(join?.draft, '/join #help');
});

test('command completion stays on the first token while command arguments complete nicks', () => {
  const argument = getComposerCompletionResult({
    candidates: ['alice'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: '/query al',
    selectionStart: '/query al'.length,
    selectionEnd: '/query al'.length,
    session: null,
  });

  assert.equal(argument?.draft, '/query alice');

  assert.equal(
    getComposerCompletionResult({
      candidates: ['alice'],
      commandCandidates: slashIrcClientCommandCompletionCandidates,
      contextKey: 'channel-1',
      direction: 'forward',
      draft: 'say /q',
      selectionStart: 'say /q'.length,
      selectionEnd: 'say /q'.length,
      session: null,
    }),
    null,
  );
});

test('completion sessions reset when the caret moves or candidates change', () => {
  const initial = getComposerCompletionResult({
    candidates: ['alice', 'anna'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: 'hello a world',
    selectionStart: 'hello a'.length,
    selectionEnd: 'hello a'.length,
    session: null,
  });

  const caretMoved = getComposerCompletionResult({
    candidates: ['alice', 'anna'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: 'hello al'.length,
    selectionEnd: 'hello al'.length,
    session: initial?.session ?? null,
  });

  assert.equal(caretMoved?.draft, 'hello alice world');

  const candidatesChanged = getComposerCompletionResult({
    candidates: ['anna', 'alice'],
    commandCandidates: slashIrcClientCommandCompletionCandidates,
    contextKey: 'channel-1',
    direction: 'forward',
    draft: initial?.draft ?? '',
    selectionStart: initial?.selectionStart ?? null,
    selectionEnd: initial?.selectionEnd ?? null,
    session: initial?.session ?? null,
  });

  assert.equal(candidatesChanged?.draft, 'hello alice world');
});

test('completion is a no-op when there is no fragment or no matching candidate', () => {
  assert.equal(
    getComposerCompletionResult({
      candidates: ['alice'],
      commandCandidates: slashIrcClientCommandCompletionCandidates,
      contextKey: 'channel-1',
      direction: 'forward',
      draft: 'hello alice world',
      selectionStart: 'hello '.length,
      selectionEnd: 'hello '.length,
      session: null,
    }),
    null,
  );

  assert.equal(
    getComposerCompletionResult({
      candidates: ['alice'],
      commandCandidates: slashIrcClientCommandCompletionCandidates,
      contextKey: 'channel-1',
      direction: 'forward',
      draft: 'hello z world',
      selectionStart: 'hello z'.length,
      selectionEnd: 'hello z'.length,
      session: null,
    }),
    null,
  );
});
