import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAssistantMessageBlocks } from '../web/src/AssistantMessageContent.js';

test('assistant message parsing keeps plain text as one block', () => {
  assert.deepEqual(parseAssistantMessageBlocks('Hello there'), [
    { type: 'text', text: 'Hello there' },
  ]);
});

test('assistant message parsing extracts fenced code blocks', () => {
  assert.deepEqual(
    parseAssistantMessageBlocks('Summary\n```ts\nconst answer = 42;\n```\nNext step'),
    [
      { type: 'text', text: 'Summary\n' },
      { type: 'code', language: 'ts', text: 'const answer = 42;' },
      { type: 'text', text: '\nNext step' },
    ],
  );
});

test('assistant message parsing ignores whitespace around standalone fenced code blocks', () => {
  assert.deepEqual(parseAssistantMessageBlocks('\n```json\n{\"ok\":true}\n```\n'), [
    { type: 'code', language: 'json', text: '{"ok":true}' },
  ]);
});
