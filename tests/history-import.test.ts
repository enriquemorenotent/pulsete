import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage, HistoryImportTextFile } from '../shared/protocol.js';
import { importLogFiles } from '../server/history-import.js';

const queryBuffer: BufferState = {
  id: 'buffer-query',
  networkId: 'network-1',
  kind: 'query',
  target: 'MissD',
  unread: 0,
};

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: 'network-1',
  kind: 'channel',
  target: '#lesdomme',
  unread: 0,
};

const hexChatFixture = [
  '**** BEGIN LOGGING AT Wed Mar 11 02:57:34 2026',
  '',
  '[MissD has address MissD@here.comes.the.sun]',
  'Mär 11 02:57:36 <sofia>\tHere I am',
  'Mär 11 02:57:45 <MissD>\tyay',
  'Mär 11 03:02:47 *\tMissD pets the lesbian bitch',
  'Mär 11 03:08:01 *\t[sofia] End of WHOIS list.',
  'Mär 11 04:33:50 *\tMissD pets her pet',
  'Mär 11 04:34:20 *\tNotify: MissD is offline (CuffLink (sofia))',
  'Mär 11 04:34:20 *\tMissD has quit (Quit: Leaving)',
  'Mär 11 04:34:20 *\tDisconnected ()',
  '**** ENDING LOGGING AT Wed Mar 11 04:37:32 2026',
].join('\n');

const readFixture = (name: string): HistoryImportTextFile => ({
  name,
  mimeType: 'text/plain',
  size: hexChatFixture.length,
  text: hexChatFixture,
});

const makeLogFile = (text: string, name = 'sample.log'): HistoryImportTextFile => ({
  name,
  mimeType: 'text/plain',
  size: text.length,
  text,
});

test('importLogFiles parses HexChat private logs and skips non-chat noise', () => {
  const result = importLogFiles({
    buffer: queryBuffer,
    existingMessages: [],
    files: [readFixture('test-import.log')],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.format, 'hexchat');
  assert.ok(result.summary.importedCount > 0);
  assert.ok(result.summary.duplicateCount >= 0);
  assert.ok(result.summary.skippedCount >= 0);
  assert.deepEqual(result.messages[0], {
    id: result.messages[0]?.id,
    networkId: 'network-1',
    target: 'MissD',
    nick: 'sofia',
    body: 'Here I am',
    kind: 'line',
    self: true,
    ts: new Date(2026, 2, 11, 2, 57, 36, 0).getTime(),
  });
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
    result.messages.map((message) => ({ nick: message.nick, kind: message.kind, self: message.self })),
    [
      { nick: 'sofia', kind: 'line', self: true },
      { nick: 'MissD', kind: 'line', self: false },
    ],
  );
});

test('importLogFiles keeps old self nick lines in query buffers when aliases are provided', () => {
  const result = importLogFiles({
    buffer: queryBuffer,
    existingMessages: [],
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <oldsofia>\thi from the old nick',
      'Mar 10 00:00:02 <MissD>\thello',
      'Mar 10 00:00:03 <other>\tthird party',
    ].join('\n'))],
    selfNicks: ['sofia', 'oldsofia'],
  });

  assert.equal(result.summary.importedCount, 2);
  assert.equal(result.summary.duplicateCount, 0);
  assert.equal(result.summary.skippedCount, 1);
  assert.deepEqual(
    result.messages.map((message) => ({ nick: message.nick, self: message.self, body: message.body })),
    [
      { nick: 'oldsofia', self: true, body: 'hi from the old nick' },
      { nick: 'MissD', self: false, body: 'hello' },
    ],
  );
});

test('importLogFiles keeps all channel participants and dedupes against uploads and existing history', () => {
  const existingMessages: ChatMessage[] = [{
    id: 'existing-1',
    networkId: 'network-1',
    target: '#lesdomme',
    nick: 'sofia',
    body: 'hi',
    kind: 'line',
    self: true,
    ts: new Date(2026, 2, 10, 0, 0, 1, 0).getTime(),
  }];
  const result = importLogFiles({
    buffer: channelBuffer,
    existingMessages,
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <sofia>\thi',
      'Mar 10 00:00:01 <sofia>\thi',
      'Mar 10 00:00:02 <MissD>\thello',
      'Mar 10 00:00:03 <other>\tthird party',
      'Mar 10 00:00:04 * other waves',
    ].join('\n'))],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.importedCount, 3);
  assert.equal(result.summary.duplicateCount, 2);
  assert.equal(result.summary.skippedCount, 0);
  assert.deepEqual(
    result.messages.map((message) => ({ nick: message.nick, kind: message.kind, body: message.body })),
    [
      { nick: 'MissD', kind: 'line', body: 'hello' },
      { nick: 'other', kind: 'line', body: 'third party' },
      { nick: 'other', kind: 'action', body: 'waves' },
    ],
  );
});

test('importLogFiles dedupes existing messages even when self aliases change', () => {
  const existingMessages: ChatMessage[] = [{
    id: 'existing-1',
    networkId: 'network-1',
    target: '#lesdomme',
    nick: 'oldsofia',
    body: 'same line',
    kind: 'line',
    self: false,
    ts: new Date(2026, 2, 10, 0, 0, 1, 0).getTime(),
  }];
  const result = importLogFiles({
    buffer: channelBuffer,
    existingMessages,
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <oldsofia>\tsame line',
    ].join('\n'))],
    selfNicks: ['sofia', 'oldsofia'],
  });

  assert.equal(result.summary.importedCount, 0);
  assert.equal(result.summary.duplicateCount, 1);
  assert.equal(result.summary.skippedCount, 0);
});
