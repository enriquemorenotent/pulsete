import {
  findMutedNickByNick,
  findMutedNickByTarget,
  isUserMuted,
  resolveMutedTarget,
} from '../../shared/muted-nicks.js';
import type { ChatMessage, MutedNickState } from '../../shared/protocol-chat.js';
import type { NetworkUserIdentity } from '../../shared/user-identity.js';

export const findMutedNick = (
  mutedNicks: readonly MutedNickState[],
  networkId: string,
  nick: string,
  identity?: NetworkUserIdentity | null,
) =>
  findMutedNickByTarget(mutedNicks, { networkId, nick, identity })
  ?? findMutedNickByNick(mutedNicks, networkId, nick);

export const isMessageMuted = (
  mutedNicks: readonly MutedNickState[],
  message: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity' | 'speakerNick'>,
) => isUserMuted(
  mutedNicks,
  resolveMutedTarget(
    message.networkId,
    message.nick ?? message.speakerNick ?? null,
    message.senderIdentity,
  ),
);

export const resolveMutedMessageNick = (
  mutedNicks: readonly MutedNickState[],
  message: Pick<ChatMessage, 'networkId' | 'nick' | 'senderIdentity' | 'speakerNick'>,
) => {
  const nick = message.nick ?? message.speakerNick ?? null;
  const target = resolveMutedTarget(message.networkId, nick, message.senderIdentity);
  if (!isUserMuted(mutedNicks, target)) {
    return null;
  }
  return target ? findMutedNickByTarget(mutedNicks, target)?.nick ?? nick : nick;
};
