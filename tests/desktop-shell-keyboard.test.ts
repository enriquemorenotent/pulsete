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

test('escape jumps the selected chat only when no blocking UI owns it', () => {
  assert.equal(
    shouldJumpChatToLatestFromKeydown(escapeEvent, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    true,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown(escapeEvent, {
      blockingDialogOpen: true,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown(escapeEvent, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: true,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown(escapeEvent, {
      blockingDialogOpen: false,
      hasSelectedBuffer: false,
      menuOpen: false,
    }),
    false,
  );
});

test('escape jump ignores modified, composing, and already-handled key events', () => {
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, ctrlKey: true }, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, isComposing: true }, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, defaultPrevented: true }, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    false,
  );
  assert.equal(
    shouldJumpChatToLatestFromKeydown({ ...escapeEvent, key: 'Enter' }, {
      blockingDialogOpen: false,
      hasSelectedBuffer: true,
      menuOpen: false,
    }),
    false,
  );
});
