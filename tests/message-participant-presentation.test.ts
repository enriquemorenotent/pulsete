import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChannelUserState, ChatMessage } from '../shared/protocol-chat.js';
import {
  buildChannelUserModesByNick,
  resolveMessageParticipantPresentation,
  resolveParticipantHighlightMode,
} from '../web/src/message-participant-presentation.js';
import { buildNickEmojiKey } from '../web/src/nick-emoji-utils.js';

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: overrides.id ?? 'message-1',
  networkId: overrides.networkId ?? 'network-1',
  target: overrides.target ?? '#help',
  nick: overrides.nick === undefined ? 'Joby' : overrides.nick,
  body: overrides.body ?? 'hello there',
  kind: overrides.kind ?? 'line',
  self: overrides.self ?? false,
  ts: overrides.ts ?? 1,
});

const buildModes = (users: ChannelUserState[]) => buildChannelUserModesByNick(users);

test('channel peer presentation uses IRC-case nicklist modes and opens PMs', () => {
  const participant = resolveMessageParticipantPresentation({
    message: makeMessage({ nick: 'OPAL' }),
    listKind: 'chat',
    rowVariant: 'full',
    highlightMode: resolveParticipantHighlightMode('channel'),
    channelUserModesByNick: buildModes([{ nick: 'Opal', mode: 'op', away: false }]),
    allowParticipantQuery: true,
  });

  assert.deepEqual(participant, {
    label: 'OPAL',
    emoji: null,
    toneClassName: 'text-amber-300',
    clickable: true,
    kindBadgeLabel: null,
  });
});

test('channel self presentation stays primary and non-clickable', () => {
  const participant = resolveMessageParticipantPresentation({
    message: makeMessage({ nick: 'sofia', self: true }),
    listKind: 'chat',
    rowVariant: 'full',
    highlightMode: resolveParticipantHighlightMode('channel'),
    channelUserModesByNick: buildModes([{ nick: 'sofia', mode: 'owner', away: false }]),
    allowParticipantQuery: true,
  });

  assert.deepEqual(participant, {
    label: 'sofia',
    emoji: null,
    toneClassName: 'text-primary',
    clickable: false,
    kindBadgeLabel: null,
  });
});

test('query presentation keeps peer coloring without PM click affordance', () => {
  const participant = resolveMessageParticipantPresentation({
    message: makeMessage({ nick: 'MissD', target: 'MissD' }),
    listKind: 'chat',
    rowVariant: 'full',
    highlightMode: resolveParticipantHighlightMode('query'),
    channelUserModesByNick: buildModes([]),
    allowParticipantQuery: true,
  });

  assert.deepEqual(participant, {
    label: 'MissD',
    emoji: null,
    toneClassName: 'text-success',
    clickable: false,
    kindBadgeLabel: null,
  });
});

test('server compact presentation resolves source labels and kind badges together', () => {
  const participant = resolveMessageParticipantPresentation({
    message: makeMessage({ nick: 'OperServ', kind: 'notice' }),
    listKind: 'server',
    rowVariant: 'compact',
    senderLabel: 'OperServ',
    highlightMode: resolveParticipantHighlightMode('server'),
    channelUserModesByNick: buildModes([]),
    allowParticipantQuery: false,
  });

  assert.deepEqual(participant, {
    label: 'OperServ',
    emoji: null,
    toneClassName: 'text-inherit',
    clickable: false,
    kindBadgeLabel: 'notice',
  });
});

test('participant presentation includes network-scoped nick emoji tags', () => {
  const participant = resolveMessageParticipantPresentation({
    message: makeMessage({ nick: 'opal' }),
    listKind: 'chat',
    rowVariant: 'full',
    highlightMode: resolveParticipantHighlightMode('channel'),
    channelUserModesByNick: buildModes([]),
    nickEmojiByNetworkNick: new Map([[buildNickEmojiKey('network-1', 'opal'), '🌙']]),
    allowParticipantQuery: true,
  });

  assert.equal(participant.emoji, '🌙');
});
