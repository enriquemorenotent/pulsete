import assert from 'node:assert/strict';
import test from 'node:test';
import { makeMessage } from './chat-pane.test.fixtures.js';
import { renderChatPane } from './chat-pane.test.renderers.js';

test('join part and quit rows keep media URLs as links without previews', () => {
  const urls = {
    join: 'https://cdn.example.com/join.png',
    part: 'https://cdn.example.com/part.png',
    quit: 'https://cdn.example.com/quit.png',
  };
  const markup = renderChatPane([
    makeMessage({
      id: 'join-message',
      body: `Joby joined #help (${urls.join})`,
      kind: 'join',
    }),
    makeMessage({
      id: 'part-message',
      body: `Joby left #help (${urls.part})`,
      kind: 'part',
    }),
    makeMessage({
      id: 'quit-message',
      body: `Joby quit (${urls.quit})`,
      kind: 'quit',
    }),
  ]);

  for (const url of Object.values(urls)) {
    assert.match(markup, new RegExp(`href="${url.replaceAll('.', '\\.')}"`));
  }
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /<video/);
  assert.doesNotMatch(markup, /Inline image preview:/);
  assert.doesNotMatch(markup, /Page not found/);
});
