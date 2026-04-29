import assert from 'node:assert/strict';
import test from 'node:test';
import { createNickReplyContext, createWhoisReplyContext } from '../server/irc-reply-context.js';
import { ReplyTracker } from '../server/irc-reply-tracker.js';
import { replyContextTtlMs } from '../server/irc-reply-context-types.js';

test('reply tracker prunes expired contexts before queueing a new one', () => {
  const originalDateNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const tracker = new ReplyTracker();
    tracker.queue(createWhoisReplyContext('server', 'alice'));

    now += replyContextTtlMs + 1;
    tracker.queue(createWhoisReplyContext('server', 'bob'));

    assert.deepEqual(
      tracker.pendingReplyContexts.map((context) =>
        context.kind === 'whois' ? context.nick : context.kind,
      ),
      ['bob'],
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('reply tracker clears stale pending nick when pruning expired contexts', () => {
  const originalDateNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  try {
    const tracker = new ReplyTracker();
    tracker.queue(createNickReplyContext('server', 'newnick'));

    now += replyContextTtlMs + 1;
    tracker.queue(createWhoisReplyContext('server', 'alice'));

    assert.equal(tracker.pendingNick, null);
  } finally {
    Date.now = originalDateNow;
  }
});
