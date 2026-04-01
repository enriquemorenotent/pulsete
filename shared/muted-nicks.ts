import { isSameIrcIdentifier } from './irc-identifiers.js';

type NickScopedEntry = {
  networkId: string;
  nick: string;
};

export const findMutedNickByNick = <T extends NickScopedEntry>(
  mutedNicks: readonly T[],
  networkId: string,
  nick: string,
) =>
  mutedNicks.find((entry) => entry.networkId === networkId && isSameIrcIdentifier(entry.nick, nick)) ?? null;

export const isNickMuted = (
  mutedNicks: readonly NickScopedEntry[],
  networkId: string,
  nick: string | null | undefined,
) => !!nick && !!findMutedNickByNick(mutedNicks, networkId, nick);
