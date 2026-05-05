import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChatPaneComposerKeyAction,
  shouldAutoFocusChatPaneComposer,
} from '../web/src/ChatPaneComposer.js';
import { resolveChatPaneComposerPrompt } from '../web/src/chat-pane-composer-prompt.js';

const makeEvent = (
  overrides: Partial<Parameters<typeof getChatPaneComposerKeyAction>[0]> = {},
) => ({
  key: overrides.key ?? 'Enter',
  shiftKey: overrides.shiftKey ?? false,
  altKey: overrides.altKey ?? false,
  ctrlKey: overrides.ctrlKey ?? false,
  metaKey: overrides.metaKey ?? false,
  nativeEvent: overrides.nativeEvent ?? { isComposing: false },
});

test('generic composer key map retains Tab when a non-empty draft should not lose focus', () => {
  assert.equal(getChatPaneComposerKeyAction(makeEvent({ key: 'Tab' }), 'hello'), 'retain-focus');
});

test('generic composer key map leaves empty-draft Tab alone', () => {
  assert.equal(getChatPaneComposerKeyAction(makeEvent({ key: 'Tab' }), ''), null);
});

test('generic composer key map leaves Shift+Tab alone', () => {
  assert.equal(getChatPaneComposerKeyAction(makeEvent({ key: 'Tab', shiftKey: true }), 'hello'), null);
});

test('chat composer does not submit while composing IME text', () => {
  assert.equal(
    getChatPaneComposerKeyAction(makeEvent({ nativeEvent: { isComposing: true } }), 'hello'),
    null,
  );
});

test('chat composer auto-focuses when the buffer context changes', () => {
  assert.equal(shouldAutoFocusChatPaneComposer('buffer-1', 'buffer-2'), true);
});

test('chat composer does not auto-focus when the buffer context is unchanged or missing', () => {
  assert.equal(shouldAutoFocusChatPaneComposer('buffer-1', 'buffer-1'), false);
  assert.equal(shouldAutoFocusChatPaneComposer('buffer-1', null), false);
});

test('prompt resolution favors command mode for server buffers', () => {
  assert.deepEqual(
    resolveChatPaneComposerPrompt({
      mode: 'commands',
    }),
    {
      actionLabel: 'Run',
      actionIcon: 'terminal',
      prefixSymbol: '/',
      variant: 'commands',
    },
  );
});

test('prompt resolution keeps normal chatting minimal', () => {
  assert.deepEqual(
    resolveChatPaneComposerPrompt({
      mode: 'normal',
    }),
    {
      actionLabel: 'Send',
      actionIcon: 'send',
      prefixSymbol: null,
      variant: 'normal',
    },
  );
});
