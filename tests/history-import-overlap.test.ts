import assert from 'node:assert/strict';
import test from 'node:test';
import type { BufferState, ChatMessage, HistoryImportTextFile } from '../shared/protocol.js';
import { importLogFiles } from '../server/history-import.js';

const channelBuffer: BufferState = {
  id: 'buffer-channel',
  networkId: 'network-1',
  kind: 'channel',
  target: '#lesdomme',
  unread: 0,
  priorityUnread: 0,
  lastReadTs: null,
  lastReadMessageId: null,
};

const makeLogFile = (text: string, name = 'sample.log'): HistoryImportTextFile => ({
  name,
  mimeType: 'text/plain',
  size: text.length,
  text,
});

test('importLogFiles keeps repeated uploaded lines and only skips existing history overlap', () => {
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

  assert.equal(result.summary.importedCount, 4);
  assert.equal(result.summary.duplicateCount, 1);
  assert.equal(result.summary.skippedCount, 0);
  assert.deepEqual(
    result.messages.map((message) => ({ nick: message.nick, kind: message.kind, body: message.body })),
    [
      { nick: 'sofia', kind: 'line', body: 'hi' },
      { nick: 'MissD', kind: 'line', body: 'hello' },
      { nick: 'other', kind: 'line', body: 'third party' },
      { nick: 'other', kind: 'action', body: 'waves' },
    ],
  );
});

test('importLogFiles keeps identical repeated lines inside one upload when history is empty', () => {
  const result = importLogFiles({
    buffer: channelBuffer,
    existingMessages: [],
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <sofia>\thi',
      'Mar 10 00:00:01 <sofia>\thi',
    ].join('\n'))],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.importedCount, 2);
  assert.equal(result.summary.duplicateCount, 0);
  assert.equal(result.summary.skippedCount, 0);
  assert.deepEqual(
    result.messages.map((message) => ({ nick: message.nick, body: message.body, ts: message.ts })),
    [
      { nick: 'sofia', body: 'hi', ts: new Date(2026, 2, 10, 0, 0, 1, 0).getTime() },
      { nick: 'sofia', body: 'hi', ts: new Date(2026, 2, 10, 0, 0, 1, 0).getTime() },
    ],
  );
});

test('importLogFiles skips all lines when re-importing the same log into existing history', () => {
  const existingMessages: ChatMessage[] = [{
    id: 'existing-1',
    networkId: 'network-1',
    target: '#lesdomme',
    nick: 'sofia',
    body: 'hi',
    kind: 'line',
    self: true,
    ts: new Date(2026, 2, 10, 0, 0, 1, 0).getTime(),
  }, {
    id: 'existing-2',
    networkId: 'network-1',
    target: '#lesdomme',
    nick: 'MissD',
    body: 'hello',
    kind: 'line',
    self: false,
    ts: new Date(2026, 2, 10, 0, 0, 2, 0).getTime(),
  }];
  const result = importLogFiles({
    buffer: channelBuffer,
    existingMessages,
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <sofia>\thi',
      'Mar 10 00:00:02 <MissD>\thello',
    ].join('\n'))],
    selfNicks: ['sofia'],
  });

  assert.equal(result.summary.importedCount, 0);
  assert.equal(result.summary.duplicateCount, 2);
  assert.equal(result.summary.skippedCount, 0);
});
