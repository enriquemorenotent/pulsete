import { isSameIrcIdentifier } from './irc-identifiers.js';
import {
  type NetworkUserIdentityTarget,
  type IdentityScopedEntry,
  identityFromNick,
  matchesIdentityScopedEntry,
  normalizeNetworkUserIdentity,
} from './user-identity.js';

type NickScopedEntry = {
  identity?: IdentityScopedEntry['identity'];
  networkId: string;
  nick: string;
};

export const findMutedNickByNick = <T extends NickScopedEntry>(
  mutedNicks: readonly T[],
  networkId: string,
  nick: string,
) =>
  mutedNicks.find((entry) =>
    entry.networkId === networkId
    && !hasStrongIdentity(entry)
    && isSameIrcIdentifier(entry.nick, nick)
  ) ?? null;

export const findMutedNickByIdentity = <T extends IdentityScopedEntry>(
  mutedNicks: readonly T[],
  target: NetworkUserIdentityTarget | null | undefined,
) => mutedNicks.find((entry) => matchesIdentityScopedEntry(entry, target)) ?? null;

export const findMutedNickByTarget = <T extends IdentityScopedEntry>(
  mutedNicks: readonly T[],
  target: NetworkUserIdentityTarget | null | undefined,
) => {
  const identityMatch = findMutedNickByIdentity(mutedNicks, target);
  if (identityMatch || !target?.nick) {
    return identityMatch;
  }
  return mutedNicks.find((entry) =>
    entry.networkId === target.networkId
    && isSameIrcIdentifier(entry.nick, target.nick)
  ) ?? null;
};

export const isNickMuted = (
  mutedNicks: readonly NickScopedEntry[],
  networkId: string,
  nick: string | null | undefined,
) => !!nick && !!findMutedNickByNick(mutedNicks, networkId, nick);

export const isUserMuted = (
  mutedNicks: readonly IdentityScopedEntry[],
  target: NetworkUserIdentityTarget | null | undefined,
) => !!findMutedNickByTarget(mutedNicks, target);

export const resolveMutedTarget = (
  networkId: string,
  nick: string | null | undefined,
  identity: NetworkUserIdentityTarget['identity'] = null,
): NetworkUserIdentityTarget | null => {
  const normalizedNick = nick?.trim();
  return normalizedNick
    ? { networkId, nick: normalizedNick, identity: identity ?? identityFromNick(normalizedNick) }
    : null;
};

const hasStrongIdentity = (entry: NickScopedEntry) => {
  const identity = normalizeNetworkUserIdentity(entry.identity);
  return !!identity && identity.kind !== 'nick';
};
