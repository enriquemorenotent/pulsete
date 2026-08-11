import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPaneMessageList } from '../web/src/ChatPaneMessageList.js';
import { PinnedMessagesSidebar } from '../web/src/PinnedMessagesSidebar.js';
import {
  buildChatTranscriptModel,
  resolveTranscriptMessageLocation,
} from '../web/src/transcript/model.js';
import { makeBuffer, makeMessage } from './chat-pane.test.fixtures.js';

test('PM text and action rows expose local pin controls while notices do not', () => {
  const buffer = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const line = makeMessage({ id: 'line', bufferId: buffer.id, target: buffer.target, kind: 'line' });
  const action = makeMessage({
    id: 'action',
    bufferId: buffer.id,
    target: buffer.target,
    kind: 'action',
    pinnedAt: 100,
  });
  const notice = makeMessage({
    id: 'notice',
    bufferId: buffer.id,
    target: buffer.target,
    kind: 'notice',
  });
  const markup = renderToStaticMarkup(
    <ChatPaneMessageList
      selectedBuffer={buffer}
      messages={[line, action, notice]}
      mutedNicks={[]}
      emptyBody="No messages"
      mode="colors"
      listKind="chat"
      canPinMessages
      hasNewerHistory
      onSetMessagePinned={async () => true}
      onReturnToLatest={async () => true}
      onOpenChannel={() => undefined}
    />,
  );

  assert.match(markup, /aria-label="Pin message"/);
  assert.match(markup, /aria-label="Unpin message"/);
  assert.match(markup, /data-message-id="action" data-message-pinned="true"/);
  assert.equal((markup.match(/aria-(?:label="Pin message"|label="Unpin message")/g) ?? []).length, 2);
  assert.match(markup, /Return to latest/);
});

test('the pinned-message sidebar identifies local pins and renders oldest first', () => {
  const buffer = makeBuffer({ id: 'query-1', kind: 'query', target: 'Alice' });
  const oldest = makeMessage({
    id: 'oldest',
    bufferId: buffer.id,
    target: buffer.target,
    body: 'first pinned thought',
    ts: 1,
    pinnedAt: 20,
  });
  const newest = makeMessage({
    id: 'newest',
    bufferId: buffer.id,
    target: buffer.target,
    body: 'second pinned thought',
    ts: 2,
    pinnedAt: 10,
  });
  const markup = renderToStaticMarkup(
    <PinnedMessagesSidebar
      buffer={buffer}
      loadState="loaded"
      messages={[oldest, newest]}
      onJump={async () => true}
      onRetry={() => undefined}
      onUnpin={async () => true}
    />,
  );

  assert.match(markup, /Pinned messages/);
  assert.match(markup, /Local to this device/);
  assert.ok(markup.indexOf('first pinned thought') < markup.indexOf('second pinned thought'));
  assert.equal((markup.match(/aria-label="Unpin message"/g) ?? []).length, 2);
});

test('pin focus resolves direct and collapsed-muted transcript rows', () => {
  const visible = makeMessage({ id: 'visible', nick: 'Bob', ts: 1 });
  const muted = makeMessage({ id: 'muted', nick: 'Alice', ts: 2 });
  const model = buildChatTranscriptModel({
    firstUnreadDividerIndex: null,
    listKind: 'chat',
    messages: [visible, muted],
    mutedNicks: [{ id: 'mute-1', networkId: muted.networkId, nick: 'Alice' }],
    unreadDividerKey: 'unread',
  }, 3);

  assert.deepEqual(resolveTranscriptMessageLocation(model, visible.id), {
    mutedGroupKey: null,
    rowIndex: 1,
  });
  const mutedLocation = resolveTranscriptMessageLocation(model, muted.id);
  assert.equal(mutedLocation?.rowIndex, 2);
  assert.match(mutedLocation?.mutedGroupKey ?? '', /^muted-group:/);
  assert.equal(resolveTranscriptMessageLocation(model, 'missing'), null);
});
