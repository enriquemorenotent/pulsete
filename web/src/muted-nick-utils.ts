import { findMutedNickByNick, isNickMuted } from '../../shared/muted-nicks.js';
import type { ChatMessage, MutedNickState } from '../../shared/protocol.js';

export const findMutedNick = (
  mutedNicks: readonly MutedNickState[],
  networkId: string,
  nick: string,
) => findMutedNickByNick(mutedNicks, networkId, nick);

export const isMessageMuted = (
  mutedNicks: readonly MutedNickState[],
  message: Pick<ChatMessage, 'networkId' | 'nick' | 'speakerNick'>,
) => isNickMuted(mutedNicks, message.networkId, message.nick ?? message.speakerNick ?? null);

export const filterMutedMessages = (
  messages: readonly ChatMessage[],
  mutedNicks: readonly MutedNickState[],
) => messages.filter((message) => !isMessageMuted(mutedNicks, message));
