import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAssistantElapsed,
  getPendingImportStatusCopy,
} from '../web/src/assistant-import-status.js';

test('formatAssistantElapsed renders minute and second durations', () => {
  assert.equal(formatAssistantElapsed(0), '0:00');
  assert.equal(formatAssistantElapsed(9_000), '0:09');
  assert.equal(formatAssistantElapsed(185_000), '3:05');
});

test('pending import copy explains the starting phase', () => {
  assert.deepEqual(
    getPendingImportStatusCopy('starting', 5_000),
    {
      title: 'Starting log import',
      detail: 'Sending the attached log files and preparing the import request.',
      hint: 'The assistant will append imported messages to this buffer when parsing finishes.',
    },
  );
});

test('pending import copy escalates messaging for longer running imports', () => {
  assert.match(getPendingImportStatusCopy('running', 45_000).detail, /Larger files can take a minute or two/);
  assert.match(getPendingImportStatusCopy('running', 180_000).hint, /has not failed unless an error appears/);
});
