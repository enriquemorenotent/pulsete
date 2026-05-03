import type { NickEmojiState } from '../../shared/protocol-chat.js';
import { isSameIrcIdentifier, normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';
import {
  type NetworkUserIdentity,
  identityKey,
  isSameNetworkUserIdentity,
  normalizeNetworkUserIdentity,
} from '../../shared/user-identity.js';

export const getNickEmojiTag = (nickEmoji: NickEmojiState | null | undefined) =>
  nickEmoji?.emoji.trim() || null;

export const findNickEmoji = (
  nickEmojis: readonly NickEmojiState[],
  networkId: string,
  nick: string,
  identity?: NetworkUserIdentity | null,
) =>
  findNickEmojiByIdentity(nickEmojis, networkId, identity)
  ?? nickEmojis.find((entry) =>
    entry.networkId === networkId
    && (entry.identity === undefined || normalizeNetworkUserIdentity(entry.identity)?.kind === 'nick')
    && isSameIrcIdentifier(entry.nick, nick)
  )
  ?? null;

export const buildNickEmojiKey = (networkId: string, nick: string) =>
  buildNickEmojiMapKey(networkId, `nick:${normalizeIrcIdentifier(nick)}`);

export const buildNickEmojiIdentityKey = (networkId: string, identity: NetworkUserIdentity) =>
  buildNickEmojiMapKey(networkId, identityKey(identity));

export const buildNickEmojiByNetworkNick = (nickEmojis: readonly NickEmojiState[]) => {
  const emojis = new Map<string, string>();
  for (const entry of nickEmojis) {
    const emoji = getNickEmojiTag(entry);
    if (emoji) {
      const identity = normalizeNetworkUserIdentity(entry.identity);
      emojis.set(
        identity
          ? buildNickEmojiIdentityKey(entry.networkId, identity)
          : buildNickEmojiKey(entry.networkId, entry.nick),
        emoji,
      );
    }
  }
  return emojis;
};

export const resolveNickEmoji = (
  nickEmojiByNetworkNick: ReadonlyMap<string, string>,
  networkId: string,
  nick: string,
  identity?: NetworkUserIdentity | null,
) => {
  const normalizedIdentity = normalizeNetworkUserIdentity(identity);
  return (
    normalizedIdentity
      ? nickEmojiByNetworkNick.get(buildNickEmojiIdentityKey(networkId, normalizedIdentity))
      : null
  ) ?? nickEmojiByNetworkNick.get(buildNickEmojiKey(networkId, nick)) ?? null;
};

export const resolveUniqueNickEmoji = (
  nickEmojis: readonly NickEmojiState[],
  nick: string,
) => {
  const matches = nickEmojis.filter((entry) => isSameIrcIdentifier(entry.nick, nick));
  const firstEmoji = matches[0]?.emoji.trim() || null;
  if (!firstEmoji) {
    return null;
  }
  return matches.every((entry) => entry.emoji.trim() === firstEmoji) ? firstEmoji : null;
};

const findNickEmojiByIdentity = (
  nickEmojis: readonly NickEmojiState[],
  networkId: string,
  identity: NetworkUserIdentity | null | undefined,
) =>
  identity
    ? nickEmojis.find((entry) =>
        entry.networkId === networkId && isSameNetworkUserIdentity(entry.identity, identity)
      ) ?? null
    : null;

const buildNickEmojiMapKey = (networkId: string, identity: string) =>
  `${networkId}\u0000${identity}`;
