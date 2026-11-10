import assert from 'node:assert/strict';
import test from 'node:test';
import { OutgoingActions } from '../server/irc-outgoing-actions.js';
import { ReplyTracker } from '../server/irc-reply-tracker.js';
import { createMessageReplyContext, createNickReplyContext } from '../server/irc-reply-context.js';

test('outgoing deadlines report unknown once and can be resolved by a definite late reply', () => {
  const actions = new OutgoingActions();
  let expired = 0;
  const action = actions.start(Date.now() + 1000, () => expired++);
  actions.expire(action.deadline);
  actions.expire(action.deadline + 1);
  assert.equal(action.state, 'unknown');
  assert.equal(expired, 1);
  action.finish('failed');
  assert.equal(action.state, 'failed');
  action.finish('confirmed');
  assert.equal(action.state, 'failed');
});

test('progress refreshes a deadline and disconnect cancels timers without declaring failure', () => {
  const actions = new OutgoingActions();
  let expired = 0;
  const action = actions.start(Date.now() + 1000, () => expired++);
  const original = action.deadline;
  action.refresh(original + 1000);
  actions.expire(original);
  assert.equal(action.state, 'waiting');
  actions.disconnect();
  actions.expire(original + 2000);
  assert.equal(action.state, 'unknown');
  assert.equal(expired, 0);
});

test('late labeled rejection retains the exact message and draft after its waiting deadline', () => {
  const tracker = new ReplyTracker();
  const context = createMessageReplyContext('#chat', '#chat', 'message-1', 'PRIVMSG', false, 'hello');
  context.label = 'request-1';
  tracker.queue(context);
  tracker.actions.expire(context.expiresAt);
  assert.equal(context.action?.state, 'unknown');
  const reply = tracker.consumeReplyContext('404', ['me', '#chat', 'Cannot send'], null, undefined, 'request-1');
  assert.equal(reply, context);
  assert.equal(reply?.kind === 'message' && reply.retryDraft, 'hello');
  assert.equal(context.action?.state, 'failed');
  tracker.reset();
});

test('an unlabeled reply cannot consume an expired labeled message', () => {
  const tracker = new ReplyTracker();
  const context = createMessageReplyContext('#chat', '#chat', 'message-1');
  context.label = 'request-1';
  tracker.queue(context);
  tracker.actions.expire(context.expiresAt);
  assert.equal(tracker.consumeReplyContext('404', ['me', '#chat', 'Cannot send'], null), null);
  tracker.reset();
});

test('expired nickname requests stop being pending without needing another incoming reply', () => {
  const tracker = new ReplyTracker();
  const context = createNickReplyContext('server', 'newnick');
  tracker.queue(context);
  tracker.actions.expire(context.expiresAt);
  assert.equal(tracker.pendingNick, null);
  assert.equal(context.action?.state, 'unknown');
  assert.equal(tracker.pendingReplyContexts.length, 0);
});

test('disconnect removes old reply correlation before a new connection reuses labels', () => {
  const tracker = new ReplyTracker();
  const old = createMessageReplyContext('#chat', '#chat', 'old');
  old.label = 'lr1';
  tracker.queue(old);
  tracker.reset();
  assert.equal(old.action?.state, 'unknown');
  assert.equal(tracker.consumeReplyContext('404', ['me', '#chat'], null, undefined, 'lr1'), null);
});

test('late reply retention is bounded and exact labels survive without another arbitrary time limit', () => {
  const tracker = new ReplyTracker();
  for (let index = 0; index < 300; index++) {
    const context = createMessageReplyContext('alice', 'alice', `message-${index}`);
    context.label = `label-${index}`;
    tracker.queue(context);
    tracker.actions.expire(context.expiresAt);
  }
  assert.equal(tracker.pendingReplyContexts.length, 256);
  tracker.actions.expire(Date.now() + 86_400_000);
  assert.equal(tracker.consumeReplyContext('404', ['me', 'alice'], null, undefined, 'label-0'), null);
  const reply = tracker.consumeReplyContext('404', ['me', 'alice'], null, undefined, 'label-299');
  assert.equal(reply?.kind === 'message' && reply.optimisticMessageId, 'message-299');
  tracker.reset();
  assert.equal(tracker.pendingReplyContexts.length, 0);
});

test('an informational labeled reply does not declare a send successful or lose a later failure', () => {
  const tracker = new ReplyTracker();
  const context = createMessageReplyContext('alice', 'alice', 'message-1');
  context.label = 'send-1';
  tracker.queue(context);
  tracker.consumeReplyContext('301', ['me', 'alice', 'Away'], null, undefined, 'send-1');
  assert.equal(context.action?.state, 'waiting');
  assert.equal(tracker.consumeReplyContext('FAIL', ['PRIVMSG', 'CANNOT_SEND', 'alice'], null, undefined, 'send-1'), context);
  assert.equal(context.action?.state, 'failed');
  tracker.reset();
});
