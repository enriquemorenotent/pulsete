import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeAssistantText } from '../shared/assistant-document.js';

test('canonicalizeAssistantText inserts missing sentence spacing in plain text', () => {
  assert.equal(
    canonicalizeAssistantText('Provided.The strongest match is “hotel fantasy.”That part matters.'),
    'Provided. The strongest match is “hotel fantasy.” That part matters.',
  );
});

test('canonicalizeAssistantText preserves fenced code blocks', () => {
  assert.equal(
    canonicalizeAssistantText('Answer:\n```txt\nProvided.The strongest match.\n```\nDone.Here'),
    'Answer:\n```txt\nProvided.The strongest match.\n```\nDone. Here',
  );
});

test('canonicalizeAssistantText expands labeled sections and evidence bullets', () => {
  assert.equal(
    canonicalizeAssistantText(
      'Answer:The clearest hotel fantasy mention is from 2026-03-23.It looks direct.Evidence: 2026-03-23 06:11 — you: "our bed, only for us 2" - 2026-03-23 03:06 — MissD: "i always want to drive and control"Limits:The evidence is still partial.',
    ),
    'Answer:\nThe clearest hotel fantasy mention is from 2026-03-23. It looks direct.\n\nEvidence:\n- 2026-03-23 06:11 — you: "our bed, only for us 2"\n- 2026-03-23 03:06 — MissD: "i always want to drive and control"\n\nLimits:\nThe evidence is still partial.',
  );
});

test('canonicalizeAssistantText preserves continuation lines inside evidence bullets', () => {
  assert.equal(
    canonicalizeAssistantText(
      'Evidence:\n- 2026-03-23 | 06:02-06:11\nMissD: "That would be our bed."\nYou: "My other marital bed."',
    ),
    'Evidence:\n- 2026-03-23 | 06:02-06:11\nMissD: "That would be our bed."\nYou: "My other marital bed."',
  );
});

test('canonicalizeAssistantText merges repeated same-day evidence bullets', () => {
  assert.equal(
    canonicalizeAssistantText(
      'Evidence:\n- 2026-03-23\nYou: "line one"\n- 2026-03-23\nMissD: "line two"',
    ),
    'Evidence:\n- 2026-03-23\nYou: "line one"\nMissD: "line two"',
  );
});
