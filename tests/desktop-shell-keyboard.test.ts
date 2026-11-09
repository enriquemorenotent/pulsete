import assert from 'node:assert/strict';
import test from 'node:test';
import {
  shouldJumpChatToLatestFromKeydown,
  type DesktopShellShortcutKeyEvent,
} from '../web/src/desktop-shell-keyboard.js';

const escapeEvent: DesktopShellShortcutKeyEvent = {
  altKey: false,
  ctrlKey: false,
  defaultPrevented: false,
  isComposing: false,
  key: 'Escape',
  metaKey: false,
  shiftKey: false,
};

test('escape jumps only when a chat is selected', () => {
  assert.equal(shouldJumpChatToLatestFromKeydown(escapeEvent, { hasSelectedBuffer: true }), true);
  assert.equal(shouldJumpChatToLatestFromKeydown(escapeEvent, { hasSelectedBuffer: false }), false);
});

test('escape jump ignores repeated, modified, composing, and already-handled key events', () => {
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, repeat: true }, {
      hasSelectedBuffer: true,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, ctrlKey: true }, {
      hasSelectedBuffer: true,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, isComposing: true }, {
      hasSelectedBuffer: true,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, defaultPrevented: true }, {
      hasSelectedBuffer: true,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, key: 'Enter' }, {
      hasSelectedBuffer: true,
    }),
    false,
  );
});
