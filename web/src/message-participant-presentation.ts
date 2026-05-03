import type { BufferState, ChannelUserMode, ChannelUserState, ChatMessage } from '../../shared/protocol-chat.js';
import { normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import { channelUserModeTone } from './channel-user-tone.js';
import { showKindLabel } from './chat-pane-message-utils.js';
import { resolveNickEmoji } from './nick-emoji-utils.js';

export type ParticipantHighlightMode = 'none' | 'channel' | 'query';

export type MessageParticipantPresentation = {
  label: string | null;
  emoji: string | null;
  toneClassName: string;
  clickable: boolean;
  kindBadgeLabel: string | null;
};

type ResolveMessageParticipantPresentationInput = {
  message: ChatMessage;
  listKind: 'chat' | 'server';
  rowVariant: 'compact' | 'full';
  senderLabel?: string | null;
  highlightMode: ParticipantHighlightMode;
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>;
  nickEmojiByNetworkNick?: ReadonlyMap<string, string>;
  allowParticipantQuery: boolean;
};

export const resolveParticipantHighlightMode = (
  bufferKind: BufferState['kind'] | null,
): ParticipantHighlightMode => {
  if (bufferKind === 'query') {
    return 'query';
  }
  if (bufferKind === 'channel') {
    return 'channel';
  }
  return 'none';
};

export const buildChannelUserModesByNick = (
  channelUsers: ChannelUserState[] | undefined,
): ReadonlyMap<string, ChannelUserMode> => {
  const modes = new Map<string, ChannelUserMode>();
  for (const user of channelUsers ?? []) {
    modes.set(normalizeIrcIdentifier(user.nick), user.mode);
  }
  return modes;
};

export const resolveMessageParticipantPresentation = (
  input: ResolveMessageParticipantPresentationInput,
): MessageParticipantPresentation => {
  const label = resolveParticipantLabel(input);
  return {
    label,
    emoji: label && input.nickEmojiByNetworkNick
      ? resolveNickEmoji(input.nickEmojiByNetworkNick, input.message.networkId, label)
      : null,
    toneClassName: resolveParticipantTone(input.message, input.highlightMode, input.channelUserModesByNick),
    clickable: label === input.message.nick && canOpenParticipantQuery(input.message, input.highlightMode, input.allowParticipantQuery),
    kindBadgeLabel: resolveKindBadgeLabel(input.message, input.listKind, input.rowVariant),
  };
};

const resolveParticipantLabel = (input: ResolveMessageParticipantPresentationInput) => {
  if (input.rowVariant === 'full') {
    return input.message.nick ?? null;
  }
  return input.senderLabel ?? (showCompactMessageNick(input.message) ? input.message.nick ?? null : null);
};

const resolveParticipantTone = (
  message: ChatMessage,
  highlightMode: ParticipantHighlightMode,
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>,
) => {
  if (highlightMode === 'none' || !message.nick) {
    return 'text-inherit';
  }
  if (message.self) {
    return 'text-primary';
  }
  if (highlightMode === 'query') {
    return 'text-success';
  }
  return channelUserModeTone(resolveChannelUserMode(message.nick, channelUserModesByNick));
};

const resolveKindBadgeLabel = (
  message: ChatMessage,
  listKind: 'chat' | 'server',
  rowVariant: 'compact' | 'full',
) => {
  const shouldShow =
    rowVariant === 'compact'
      ? listKind === 'server' && !!message.nick && showKindLabel(message)
      : showKindLabel(message);
  return shouldShow ? message.kind : null;
};

const showCompactMessageNick = (message: ChatMessage) =>
  !!message.nick && (message.kind === 'line' || message.kind === 'action' || showKindLabel(message));

const canOpenParticipantQuery = (
  message: ChatMessage,
  highlightMode: ParticipantHighlightMode,
  allowParticipantQuery: boolean,
) => allowParticipantQuery && highlightMode === 'channel' && !!message.nick && !message.self;

const resolveChannelUserMode = (
  nick: string,
  channelUserModesByNick: ReadonlyMap<string, ChannelUserMode>,
) => channelUserModesByNick.get(normalizeIrcIdentifier(nick)) ?? 'normal';
