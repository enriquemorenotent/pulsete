import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, MutedNickState } from '../shared/protocol-chat.js';
import {
  deriveChatTranscriptModel,
  type ChatTranscriptDerivation,
} from '../web/src/transcript/model-derivation.js';
import {
  buildChatTranscriptModel,
  type BuildChatTranscriptModelInput,
} from '../web/src/transcript/model.js';

const makeMessage = (
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  body: overrides.body ?? id,
  bufferId: overrides.bufferId ?? 'buffer-1',
  kind: overrides.kind ?? 'line',
  networkId: overrides.networkId ?? 'network-1',
  nick: overrides.nick === undefined ? 'Joby' : overrides.nick,
  self: overrides.self ?? false,
  target: overrides.target ?? '#help',
  ts: overrides.ts ?? Number(id.replace(/\D/g, '')),
});

const mutedNicks: readonly MutedNickState[] = [{
  id: 'mute-missd',
  networkId: 'network-1',
  nick: 'MissD',
}];

const makeInput = (
  messages: ChatMessage[],
  overrides: Partial<BuildChatTranscriptModelInput> = {},
): BuildChatTranscriptModelInput => ({
  firstUnreadDividerIndex: overrides.firstUnreadDividerIndex ?? null,
  listKind: overrides.listKind ?? 'chat',
  messages,
  mutedNicks: overrides.mutedNicks ?? mutedNicks,
  unreadDividerKey: overrides.unreadDividerKey ?? 'unread-divider:buffer-1',
});

const derive = (
  input: BuildChatTranscriptModelInput,
  previous: ChatTranscriptDerivation | null = null,
  now?: number,
) => deriveChatTranscriptModel(input, previous, now);

const assertMatchesFullBuild = (
  derivation: ChatTranscriptDerivation,
  input: BuildChatTranscriptModelInput,
  now?: number,
) => assert.deepEqual(derivation.model, buildChatTranscriptModel(input, now));

test('live append derives only new transcript rows', () => {
  const firstMessage = makeMessage('message-1', { ts: 1_000 });
  const secondMessage = makeMessage('message-2', { ts: 2_000 });
  const appendedMessage = makeMessage('message-3', { ts: 3_000 });
  const first = derive(makeInput([firstMessage, secondMessage]));
  const retainedRow = first.model.flatRows[1];
  const input = makeInput([firstMessage, secondMessage, appendedMessage]);

  const next = derive(input, first);

  assert.equal(next.strategy, 'append');
  assert.equal(next.model.flatRows[1], retainedRow);
  assertMatchesFullBuild(next, input);
});

test('live append extends muted and server tail groups', () => {
  const mutedFirst = makeMessage('message-1', { nick: 'MissD', ts: 1_000 });
  const mutedSecond = makeMessage('message-2', { nick: 'missd', ts: 2_000 });
  const muted = derive(makeInput([mutedFirst]));
  const mutedInput = makeInput([mutedFirst, mutedSecond]);
  const mutedNext = derive(mutedInput, muted);

  assert.equal(mutedNext.strategy, 'append');
  assertMatchesFullBuild(mutedNext, mutedInput);

  const serverFirst = makeMessage('server-1', {
    kind: 'system',
    nick: null,
    target: 'server',
    ts: 1_000,
  });
  const serverSecond = makeMessage('server-2', {
    kind: 'system',
    nick: null,
    target: 'server',
    ts: 2_000,
  });
  const server = derive(makeInput([serverFirst], { listKind: 'server' }));
  const serverInput = makeInput(
    [serverFirst, serverSecond],
    { listKind: 'server' },
  );
  const serverNext = derive(serverInput, server);

  assert.equal(serverNext.strategy, 'append');
  assertMatchesFullBuild(serverNext, serverInput);
});

test('sliding window reuses retained rows and resets the leading timestamp', () => {
  const messages = [
    makeMessage('message-1', { ts: 1_000 }),
    makeMessage('message-2', { ts: 2_000 }),
    makeMessage('message-3', { ts: 3_000 }),
  ];
  const first = derive(makeInput(messages));
  const retainedThirdRow = first.model.flatRows.find(
    (row) => row.kind === 'message' && row.message === messages[2],
  );
  const appended = makeMessage('message-4', { ts: 4_000 });
  const input = makeInput([messages[1], messages[2], appended]);

  const next = derive(input, first);

  assert.equal(next.strategy, 'sliding-window');
  assert.equal(next.model.flatRows[1]?.kind, 'message');
  assert.equal(
    next.model.flatRows[1]?.kind === 'message'
      ? next.model.flatRows[1].hideTimestamp
      : null,
    false,
  );
  assert.equal(
    next.model.flatRows.find(
      (row) => row.kind === 'message' && row.message === messages[2],
    ),
    retainedThirdRow,
  );
  assertMatchesFullBuild(next, input);
});

test('sliding window trims a leading muted group without rebuilding later rows', () => {
  const mutedFirst = makeMessage('message-1', { nick: 'MissD', ts: 1_000 });
  const mutedSecond = makeMessage('message-2', { nick: 'MissD', ts: 2_000 });
  const visible = makeMessage('message-3', { ts: 3_000 });
  const first = derive(makeInput([mutedFirst, mutedSecond, visible]));
  const retainedVisibleRow = first.model.flatRows.at(-1);
  const appended = makeMessage('message-4', { ts: 4_000 });
  const input = makeInput([mutedSecond, visible, appended]);

  const next = derive(input, first);

  assert.equal(next.strategy, 'sliding-window');
  assert.equal(next.model.flatRows[2], retainedVisibleRow);
  assertMatchesFullBuild(next, input);
});

test('sliding window keeps an unread divider anchored to retained messages', () => {
  const messages = [
    makeMessage('message-1'),
    makeMessage('message-2'),
    makeMessage('message-3'),
  ];
  const first = derive(makeInput(messages, { firstUnreadDividerIndex: 1 }));
  const appended = makeMessage('message-4');
  const input = makeInput(
    [messages[1], messages[2], appended],
    { firstUnreadDividerIndex: 0 },
  );

  const next = derive(input, first);

  assert.equal(next.strategy, 'sliding-window');
  assertMatchesFullBuild(next, input);
});

test('complex changes safely fall back to a full derivation', () => {
  const messages = [makeMessage('message-1'), makeMessage('message-2')];
  const first = derive(makeInput(messages));
  const prepended = makeInput([makeMessage('message-0', { ts: 0 }), ...messages]);
  const changedMessage = { ...messages[0], body: 'edited' };

  assert.equal(derive(prepended, first).strategy, 'full');
  assert.equal(
    derive(makeInput([changedMessage, messages[1]]), first).strategy,
    'full',
  );
  assert.equal(
    derive(makeInput(messages, { mutedNicks: [...mutedNicks] }), first).strategy,
    'full',
  );
});

test('local day rollover refreshes dynamic day divider labels', () => {
  const firstDay = new Date(2026, 2, 11, 12).getTime();
  const secondDay = new Date(2026, 2, 12, 12).getTime();
  const firstMessage = makeMessage('message-1', { ts: firstDay });
  const first = derive(makeInput([firstMessage]), null, firstDay);
  const input = makeInput([
    firstMessage,
    makeMessage('message-2', { ts: secondDay }),
  ]);

  const next = derive(input, first, secondDay);

  assert.equal(next.strategy, 'full');
  assertMatchesFullBuild(next, input, secondDay);
  assert.deepEqual(
    next.model.groups.map(({ label }) => label),
    ['Yesterday', 'Today'],
  );
});
