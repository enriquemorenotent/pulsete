import assert from 'node:assert/strict';
import test from 'node:test';
import { hasIrcMention } from '../server/message-mentions.js';

test('hasIrcMention matches whole nick tokens with IRC case folding', () => {
  assert.equal(hasIrcMention('Hello TESTER, are you there?', ['tester']), true);
  assert.equal(hasIrcMention('ping test{r}', ['test[r]']), true);
});

test('hasIrcMention ignores substring matches', () => {
  assert.equal(hasIrcMention('contesters unite', ['tester']), false);
  assert.equal(hasIrcMention('alphabet soup', ['alp']), false);
});
