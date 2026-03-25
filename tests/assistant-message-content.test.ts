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

test('assistant document parsing keeps multi-line evidence bullets together', () => {
  const document = parseAssistantDocument(
    'Evidence:\n- 2026-03-23 | 06:02-06:11\nMissD: "That would be our bed."\nYou: "My other marital bed."',
  );

  assert.deepEqual(document.sections[0], {
    label: 'Evidence',
    blocks: [{
      type: 'bullet-list',
      items: [{
        lines: [
          '2026-03-23 | 06:02-06:11',
          'MissD: "That would be our bed."',
          'You: "My other marital bed."',
        ],
      }],
    }],
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

  assert.match(html, /The clearest match is from March 23, 2026\./);
  assert.doesNotMatch(html, /Answer:/);
  assert.doesNotMatch(html, /Evidence:/);
  assert.doesNotMatch(html, /Limits:/);
  assert.match(html, /grid grid-cols-\[auto_minmax\(0,1fr\)\] gap-x-2 leading-6/);
  assert.match(html, />-<\/span>/);
  assert.match(html, /2026-03-23 06:11/);
  assert.match(html, /partial evidence only\./);
});

test('assistant message rendering keeps multi-line evidence bullets readable', () => {
  const html = renderToStaticMarkup(
    createElement(AssistantMessageContent, {
      text: 'Evidence:\n- 2026-03-23 | 06:02-06:11\nMissD: "That would be our bed."\nYou: "My other marital bed."',
      onOpenChannel() {},
    }),
  );

  assert.match(html, /2026-03-23 \| 06:02-06:11/);
  assert.match(html, /MissD: &quot;That would be our bed\.&quot;/);
  assert.match(html, /You: &quot;My other marital bed\.&quot;/);
});

test('assistant message rendering collapses repeated same-day evidence headings', () => {
  const html = renderToStaticMarkup(
    createElement(AssistantMessageContent, {
      text: 'Evidence:\n- 2026-03-23\nYou: "line one"\n- 2026-03-23\nMissD: "line two"',
      normalizeText: true,
      onOpenChannel() {},
    }),
  );

  assert.equal(html.match(/2026-03-23/g)?.length, 1);
  assert.match(html, /You: &quot;line one&quot;/);
  assert.match(html, /MissD: &quot;line two&quot;/);
});

test('assistant message rendering replaces model evidence with deterministic evidence groups', () => {
  const html = renderToStaticMarkup(
    createElement(AssistantMessageContent, {
      text: 'Answer:\nThe hotel fantasy is from March 23, 2026.\n\nEvidence:\n- 2026-03-23\nYou: "wrong attribution"\n\nLimits:\nThe evidence is partial.',
      evidenceGroups: [{
        heading: '2026-03-23',
        lines: [
          {
            messageId: 'msg-1',
            speakerRole: 'peer',
            speakerNick: 'MissD',
            attributionConfidence: 'high',
            body: '"That would be our bed, only for us 2."',
            kind: 'line',
          },
          {
            messageId: 'msg-2',
            speakerRole: 'self',
            speakerNick: 'sofia',
            attributionConfidence: 'high',
            body: '"My other marital bed."',
            kind: 'line',
          },
        ],
      }],
      onOpenChannel() {},
    }),
  );

  assert.match(html, /The hotel fantasy is from March 23, 2026\./);
  assert.doesNotMatch(html, /Evidence:/);
  assert.match(html, /<p class="text-\[11px\] uppercase tracking-\[0\.12em\] text-muted-foreground">2026-03-23<\/p>/);
  assert.match(html, /MissD: <\/span>&quot;That would be our bed, only for us 2\.&quot;/);
  assert.match(html, /You: <\/span>&quot;My other marital bed\.&quot;/);
  assert.doesNotMatch(html, /wrong attribution/);
  assert.match(html, /The evidence is partial\./);
});
