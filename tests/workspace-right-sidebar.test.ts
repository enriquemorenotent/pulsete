import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDefaultSidebarTab,
  resolveSidebarTab,
} from '../web/src/WorkspaceRightSidebar.js';

test('sidebar defaults to users when nicklist tabs are available', () => {
  assert.equal(getDefaultSidebarTab(true), 'users');
});

test('sidebar defaults to assistant when only the assistant pane is available', () => {
  assert.equal(getDefaultSidebarTab(false), 'assistant');
});

test('sidebar can default to assistant when requested in a tabbed sidebar', () => {
  assert.equal(getDefaultSidebarTab(true, 'assistant'), 'assistant');
});

test('sidebar preserves the chosen tab while nicklist tabs remain available', () => {
  assert.equal(resolveSidebarTab('assistant', true), 'assistant');
});

test('sidebar forces assistant when the users tab is unavailable', () => {
  assert.equal(resolveSidebarTab('users', false), 'assistant');
});
