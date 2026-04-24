import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../shared/protocol.js';
import { importLogFiles } from '../server/history-import.js';
import {
  channelBuffer,
  makeLogFile,
  queryBuffer,
} from './helpers/history-import-test-helpers.js';

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
    result.messages.map((message) => ({
      nick: message.nick,
      self: message.self,
      body: message.body,
      speakerRole: message.speakerRole,
    })),
    [
      { nick: 'oldsofia', self: true, body: 'hi from the old nick', speakerRole: 'self' },
      { nick: 'MissD', self: false, body: 'hello', speakerRole: 'peer' },
    ],
  );
});

test('importLogFiles marks old self nick lines as self in channel buffers when aliases are provided', () => {
  const result = importLogFiles({
    buffer: channelBuffer,
    existingMessages: [],
    files: [makeLogFile([
      '**** BEGIN LOGGING AT Tue Mar 10 00:00:00 2026',
      'Mar 10 00:00:01 <oldsofia>\tchannel self line',
      'Mar 10 00:00:02 <MissD>\thello',
    ].join('\n'))],
    selfNicks: ['sofia', 'oldsofia'],
  });

  assert.deepEqual(
    result.messages.map((message) => ({
      nick: message.nick,
      self: message.self,
      speakerRole: message.speakerRole,
      attributionSource: message.attributionSource,
    })),
    [
      { nick: 'oldsofia', self: true, speakerRole: 'self', attributionSource: 'import-alias' },
      { nick: 'MissD', self: false, speakerRole: 'other', attributionSource: 'unknown' },
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
