import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NickEmojiEditorControl,
  NickEmojiPickerMenu,
  nickEmojiTagOptions,
} from '../web/src/NickEmojiEditorControl.js';

test('nick emoji editor opens a menu trigger instead of a free-form input', () => {
  const markup = renderToStaticMarkup(
    createElement(NickEmojiEditorControl, {
      emoji: '✅',
      nick: 'Alice',
      onSave: async () => true,
    }),
  );

  assert.match(markup, /aria-haspopup="menu"/);
  assert.match(markup, /aria-label="Edit emoji tag for Alice"/);
  assert.match(markup, /✅/);
  assert.doesNotMatch(markup, /<input/);
});

test('nick emoji picker renders predefined options and a clear action', () => {
  const markup = renderToStaticMarkup(
    createElement(NickEmojiPickerMenu, {
      emoji: '✅',
      nick: 'Alice',
      onSelect: () => undefined,
    }),
  );

  assert.match(markup, /role="menu"/);
  assert.match(markup, /aria-label="Clear emoji tag for Alice"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /Worth talking emoji tag for Alice/);
  assert.match(markup, /Avoid emoji tag for Alice/);
  assert.doesNotMatch(markup, /<input/);
  for (const option of nickEmojiTagOptions) {
    assert.match(markup, new RegExp(option.emoji));
    assert.match(markup, new RegExp(`${option.label} emoji tag for Alice`));
  }
});
