import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSubmitAssistantPrompt } from '../web/src/AssistantPanel.js';

const makeEvent = (overrides: Partial<Parameters<typeof shouldSubmitAssistantPrompt>[0]> = {}) => ({
  key: overrides.key ?? 'Enter',
  shiftKey: overrides.shiftKey ?? false,
  altKey: overrides.altKey ?? false,
  ctrlKey: overrides.ctrlKey ?? false,
  metaKey: overrides.metaKey ?? false,
  nativeEvent: overrides.nativeEvent ?? { isComposing: false },
});

test('assistant composer submits on plain Enter', () => {
  assert.equal(shouldSubmitAssistantPrompt(makeEvent()), true);
});

test('assistant composer keeps Shift+Enter for multiline input', () => {
  assert.equal(shouldSubmitAssistantPrompt(makeEvent({ shiftKey: true })), false);
});

test('assistant composer does not submit while composing IME text', () => {
  assert.equal(shouldSubmitAssistantPrompt(makeEvent({ nativeEvent: { isComposing: true } })), false);
});
