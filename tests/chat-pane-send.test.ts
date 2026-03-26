import assert from 'node:assert/strict';
import test from 'node:test';
import { sendComposerAndFollowBottom } from '../web/src/chat-pane-send.js';

test('sendComposerAndFollowBottom snaps to the bottom after a successful send', async () => {
  let scrolled = false;

  await sendComposerAndFollowBottom({
    sendComposer: async () => true,
    forceScrollToBottomRef: {
      current: () => {
        scrolled = true;
      },
    },
  });

  assert.equal(scrolled, true);
});

test('sendComposerAndFollowBottom leaves scroll position alone when nothing was sent', async () => {
  let scrolled = false;

  await sendComposerAndFollowBottom({
    sendComposer: async () => false,
    forceScrollToBottomRef: {
      current: () => {
        scrolled = true;
      },
    },
  });

  assert.equal(scrolled, false);
});
