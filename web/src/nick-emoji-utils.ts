import type { NickEmojiState } from '../../shared/protocol.js';
import { isSameIrcIdentifier, normalizeIrcIdentifier } from '../../shared/irc-identifiers.js';

export const getNickEmojiTag = (nickEmoji: NickEmojiState | null | undefined) =>
  nickEmoji?.emoji.trim() || null;

export const findNickEmoji = (
  nickEmojis: readonly NickEmojiState[],
  networkId: string,
  nick: string,
) =>
  nickEmojis.find((entry) =>
    entry.networkId === networkId && isSameIrcIdentifier(entry.nick, nick)
  ) ?? null;

export const buildNickEmojiKey = (networkId: string, nick: string) =>
  `${networkId}\u0000${normalizeIrcIdentifier(nick)}`;

export const buildNickEmojiByNetworkNick = (nickEmojis: readonly NickEmojiState[]) => {
  const emojis = new Map<string, string>();
  for (const entry of nickEmojis) {
    const emoji = getNickEmojiTag(entry);
    if (emoji) {
      emojis.set(buildNickEmojiKey(entry.networkId, entry.nick), emoji);
    }
  }
  return emojis;
};

export const resolveNickEmoji = (
  nickEmojiByNetworkNick: ReadonlyMap<string, string>,
  networkId: string,
  nick: string,
) => nickEmojiByNetworkNick.get(buildNickEmojiKey(networkId, nick)) ?? null;

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
