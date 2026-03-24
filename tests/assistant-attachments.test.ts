import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantMaxTextBytes,
  assistantMaxTextChars,
  hasAssistantDroppedFiles,
  listAssistantDroppedFiles,
  prepareAssistantAttachments,
} from '../web/src/assistant-attachments.js';

test('prepareAssistantAttachments serializes supported text files and truncates oversized content', async () => {
  const source = `${'A'.repeat(assistantMaxTextChars)}${'B'.repeat(400)}`;
  const [attachment] = await prepareAssistantAttachments([
    new File([source], 'notes.md', { type: 'text/markdown' }),
  ]);

  assert.equal(attachment?.kind, 'text');
  assert.equal(attachment?.name, 'notes.md');
  assert.match(attachment?.kind === 'text' ? attachment.text : '', /\[Truncated\. Showing the start and end of the file\.\]/);
  assert.equal(attachment?.kind === 'text' && attachment.text.includes('A'.repeat(100)), true);
  assert.equal(attachment?.kind === 'text' && attachment.text.includes('B'.repeat(100)), true);
});

test('prepareAssistantAttachments rejects unsupported file types', async () => {
  await assert.rejects(
    prepareAssistantAttachments([
      new File(['PK'], 'archive.zip', { type: 'application/zip' }),
    ]),
    /not a supported attachment type/,
  );
});

test('prepareAssistantAttachments rejects text files above the 4 MB limit', async () => {
  await assert.rejects(
    prepareAssistantAttachments([
      new File(['A'.repeat(assistantMaxTextBytes + 1)], 'huge.log', { type: 'text/plain' }),
    ]),
    /4 MB text file limit/,
  );
});

test('assistant drop helpers detect file drags and expose the dropped files', () => {
  const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  const payload = {
    types: ['Files'],
    files: [file],
  };

  assert.equal(hasAssistantDroppedFiles(payload), true);
  assert.deepEqual(listAssistantDroppedFiles(payload), [file]);
  assert.equal(hasAssistantDroppedFiles({ types: ['text/plain'], files: [] }), false);
});
