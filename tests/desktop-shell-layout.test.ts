import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultCompactWorkspacePane,
  resolveCompactWorkspacePane,
} from '../web/src/desktop-shell-layout.js';

test('compact layout defaults to browse when no buffer is selected', () => {
  assert.equal(getDefaultCompactWorkspacePane(null), 'browse');
});

test('compact layout defaults to chat when a buffer is already selected', () => {
  assert.equal(getDefaultCompactWorkspacePane('buffer-1'), 'chat');
});

test('compact layout moves from browse to chat after selecting a buffer', () => {
  assert.equal(
    resolveCompactWorkspacePane({
      current: 'browse',
      selectedBufferId: 'buffer-2',
      previousSelectedBufferId: 'buffer-1',
      showAssistantPane: true,
    }),
    'chat',
  );
});

test('compact layout keeps the assistant pane active while switching between assistant buffers', () => {
  assert.equal(
    resolveCompactWorkspacePane({
      current: 'assistant',
      selectedBufferId: 'buffer-2',
      previousSelectedBufferId: 'buffer-1',
      showAssistantPane: true,
    }),
    'assistant',
  );
});

test('compact layout falls back to chat when the assistant pane becomes unavailable', () => {
  assert.equal(
    resolveCompactWorkspacePane({
      current: 'assistant',
      selectedBufferId: 'buffer-1',
      previousSelectedBufferId: 'buffer-1',
      showAssistantPane: false,
    }),
    'chat',
  );
});
