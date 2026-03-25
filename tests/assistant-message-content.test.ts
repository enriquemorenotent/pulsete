import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canonicalizeAssistantText,
  parseAssistantDocument,
} from '../shared/assistant-document.js';
import { AssistantMessageContent } from '../web/src/AssistantMessageContent.js';

test('assistant document parsing keeps plain text as a paragraph block', () => {
  assert.deepEqual(parseAssistantDocument('Hello there'), {
    sections: [{
      label: null,
      blocks: [{ type: 'paragraph', lines: ['Hello there'] }],
    }],
  });
});

test('assistant document parsing extracts labeled sections, bullets, and fenced code', () => {
  const document = parseAssistantDocument(
    canonicalizeAssistantText('Answer:It fits.\n\nEvidence:- first quote - second quote\n\n```ts\nconst answer = 42;\n```'),
  );

  assert.deepEqual(document, {
    sections: [
      {
        label: 'Answer',
        blocks: [{ type: 'paragraph', lines: ['It fits.'] }],
      },
      {
        label: 'Evidence',
        blocks: [
          { type: 'bullet-list', items: [{ lines: ['first quote'] }, { lines: ['second quote'] }] },
          { type: 'code-fence', language: 'ts', text: 'const answer = 42;' },
        ],
      },
    ],
  });
});

test('assistant message rendering preserves structured sections for stale assistant text', () => {
  const html = renderToStaticMarkup(
    createElement(AssistantMessageContent, {
      text: 'Answer:The clearest match is from March 23, 2026.Evidence:- 2026-03-23 06:11 — you: "our bed, only for us 2"Limits:- partial evidence only.',
      normalizeText: true,
      onOpenChannel() {},
    }),
  );

  assert.match(html, /<p class="text-\[13px\] font-semibold text-foreground">Answer:<\/p>/);
  assert.match(html, /The clearest match is from March 23, 2026\./);
  assert.match(html, /<p class="text-\[13px\] font-semibold text-foreground">Evidence:<\/p>/);
  assert.match(html, /grid grid-cols-\[auto_minmax\(0,1fr\)\] gap-x-2 leading-6/);
  assert.match(html, />-<\/span>/);
  assert.match(html, /2026-03-23 06:11/);
  assert.match(html, /<p class="text-\[13px\] font-semibold text-foreground">Limits:<\/p>/);
});
