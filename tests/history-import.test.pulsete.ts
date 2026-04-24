import assert from 'node:assert/strict';
import test from 'node:test';
import { importLogFiles } from '../server/history-import.js';
import { makeLogFile, queryBuffer } from './helpers/history-import-test-helpers.js';

test('importLogFiles parses Pulsete history exports for query buffers', () => {
  const pulseteExport = [
    'Buffer: MissD',
    'Type: query',
    'Network: Cuff-Link (sofia)',
    'Exported at: 2026-03-25 13:11 UTC',
    'Total messages: 4',
    'History range: 2025-10-31 01:29 UTC to 2025-10-31 01:32 UTC',
    '',
    '[2025-10-31 01:29] sofiaIsBack: Hello, how are you?',
    '[2025-10-31 01:30] MissD: im well thanks',
    '[2025-10-31 01:31] * sofiaIsBack waves',
    '[2025-10-31 01:32] (system) imported from export',
  ].join('\n');
  const result = importLogFiles({
    buffer: queryBuffer,
    existingMessages: [],
    files: [makeLogFile(pulseteExport, 'history-cuff-link-sofia-missd.txt')],
    selfNicks: ['sofia', 'sofiaIsBack'],
  });

  assert.equal(result.summary.format, 'pulsete');
  assert.equal(result.summary.importedCount, 3);
  assert.equal(result.summary.duplicateCount, 0);
  assert.equal(result.summary.skippedCount, 0);
  assert.deepEqual(
    result.messages.map((message) => ({
      ts: message.ts,
      nick: message.nick,
      kind: message.kind,
      self: message.self,
      speakerRole: message.speakerRole,
      body: message.body,
    })),
    [
      {
        ts: Date.parse('2025-10-31T01:29:00Z'),
        nick: 'sofiaIsBack',
        kind: 'line',
        self: true,
        speakerRole: 'self',
        body: 'Hello, how are you?',
      },
      {
        ts: Date.parse('2025-10-31T01:30:00Z'),
        nick: 'MissD',
        kind: 'line',
        self: false,
        speakerRole: 'peer',
        body: 'im well thanks',
      },
      {
        ts: Date.parse('2025-10-31T01:31:00Z'),
        nick: 'sofiaIsBack',
        kind: 'action',
        self: true,
        speakerRole: 'self',
        body: 'waves',
      },
    ],
  );
});
