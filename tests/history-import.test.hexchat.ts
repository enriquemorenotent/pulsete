import assert from 'node:assert/strict';
import test from 'node:test';
import { importLogFiles } from '../server/history-import.js';
import {
  makeLogFile,
  queryBuffer,
  readHexChatFixture,
} from './helpers/history-import-test-helpers.js';

test('importLogFiles parses HexChat private logs and skips non-chat noise', () => {
  const result = importLogFiles({
    buffer: queryBuffer,
    existingMessages: [],
    files: [readHexChatFixture('test-import.log')],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.format, 'hexchat');
  assert.ok(result.summary.importedCount > 0);
  assert.ok(result.summary.duplicateCount >= 0);
  assert.ok(result.summary.skippedCount >= 0);
  assert.match(result.messages[0]?.id ?? '', /.+/);
  assert.equal(result.messages[0]?.networkId, 'network-1');
  assert.equal(result.messages[0]?.target, 'MissD');
  assert.equal(result.messages[0]?.nick, 'sofia');
  assert.equal(result.messages[0]?.speakerRole, 'self');
  assert.equal(result.messages[0]?.speakerNick, 'sofia');
  assert.equal(result.messages[0]?.attributionSource, 'query-alias');
  assert.equal(result.messages[0]?.attributionConfidence, 'high');
  assert.equal(result.messages[0]?.body, 'Here I am');
  assert.equal(result.messages[0]?.kind, 'line');
  assert.equal(result.messages[0]?.self, true);
  assert.equal(result.messages[0]?.ts, new Date(2026, 2, 11, 2, 57, 36, 0).getTime());
  assert.ok(result.messages.some((message) =>
    message.kind === 'action'
    && message.nick === 'MissD'
    && message.body === 'pets the lesbian bitch'
  ));
  assert.ok(result.messages.every((message) => message.nick !== '[sofia]'));
  assert.ok(result.messages.every((message) => !/has quit|is offline|End of WHOIS list|\(\)/i.test(message.body)));
});

test('importLogFiles keeps only self and peer lines for query buffers', () => {
  const result = importLogFiles({
    buffer: queryBuffer,
    existingMessages: [],
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <sofia>\thi',
      'Mar 10 00:00:02 <MissD>\thello',
      'Mar 10 00:00:03 <other>\tthird party',
      'Mar 10 00:00:04 * other waves',
    ].join('\n'))],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.importedCount, 2);
  assert.equal(result.summary.duplicateCount, 0);
  assert.equal(result.summary.skippedCount, 2);
  assert.deepEqual(
    result.messages.map((message) => ({
      nick: message.nick,
      kind: message.kind,
      self: message.self,
      speakerRole: message.speakerRole,
      attributionSource: message.attributionSource,
    })),
    [
      { nick: 'sofia', kind: 'line', self: true, speakerRole: 'self', attributionSource: 'query-alias' },
      { nick: 'MissD', kind: 'line', self: false, speakerRole: 'peer', attributionSource: 'query-target' },
    ],
  );
});
