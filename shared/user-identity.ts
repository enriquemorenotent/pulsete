import { z } from 'zod';
import { isSameIrcIdentifier, normalizeIrcIdentifier } from './irc-identifiers.js';

export const userIdentityKindSchema = z.enum(['account', 'userhost', 'nick']);
export type UserIdentityKind = z.infer<typeof userIdentityKindSchema>;

export const networkUserIdentitySchema = z.object({
  kind: userIdentityKindSchema,
  value: z.string().min(1),
});
export type NetworkUserIdentity = z.infer<typeof networkUserIdentitySchema>;

export type UserIdentitySource = {
  account?: string | null;
  host?: string | null;
  nick?: string | null;
  username?: string | null;
};

export type NetworkUserIdentityTarget = {
  identity?: NetworkUserIdentity | null;
  networkId: string;
  nick: string;
};

export type IdentityScopedEntry = {
  identity?: NetworkUserIdentity | null;
  networkId: string;
  nick: string;
};

export const normalizeAccountIdentity = (account: string | null | undefined) => {
  const value = account?.trim() ?? '';
  return value && value !== '*' ? normalizeIrcIdentifier(value) : null;
};

export const normalizeNickIdentity = (nick: string | null | undefined) => {
  const value = nick?.trim() ?? '';
  return value ? normalizeIrcIdentifier(value) : null;
};

export const normalizeUserhostIdentity = (
  username: string | null | undefined,
  host: string | null | undefined,
) => {
  const normalizedUsername = normalizeNickIdentity(username);
  const normalizedHost = host?.trim().toLowerCase() ?? '';
  return normalizedUsername && normalizedHost
    ? `${normalizedUsername}@${normalizedHost}`
    : null;
};

export const normalizeNetworkUserIdentity = (
  identity: NetworkUserIdentity | null | undefined,
): NetworkUserIdentity | null => {
  if (!identity) {
    return null;
  }
  const value = normalizeIdentityValue(identity.kind, identity.value);
  return value ? { kind: identity.kind, value } : null;
};

export const resolveNetworkUserIdentity = (
  source: UserIdentitySource,
): NetworkUserIdentity | null => {
  const account = normalizeAccountIdentity(source.account);
  if (account) {
    return { kind: 'account', value: account };
  }
  const userhost = normalizeUserhostIdentity(source.username, source.host);
  if (userhost) {
    return { kind: 'userhost', value: userhost };
  }
  const nick = normalizeNickIdentity(source.nick);
  return nick ? { kind: 'nick', value: nick } : null;
};

export const resolveIdentityTarget = (
  networkId: string,
  source: UserIdentitySource,
): NetworkUserIdentityTarget | null => {
  const nick = source.nick?.trim() ?? '';
  if (!networkId || !nick) {
    return null;
  }
  return {
    networkId,
    nick,
    identity: resolveNetworkUserIdentity(source),
  };
};

export const identityFromNick = (nick: string) =>
  resolveNetworkUserIdentity({ nick }) ?? { kind: 'nick' as const, value: normalizeIrcIdentifier(nick) };

export const identityKey = (identity: NetworkUserIdentity) =>
  `${identity.kind}:${identity.value}`;

export const isSameNetworkUserIdentity = (
  left: NetworkUserIdentity | null | undefined,
  right: NetworkUserIdentity | null | undefined,
) => {
  const normalizedLeft = normalizeNetworkUserIdentity(left);
  const normalizedRight = normalizeNetworkUserIdentity(right);
  return !!normalizedLeft
    && !!normalizedRight
    && normalizedLeft.kind === normalizedRight.kind
    && normalizedLeft.value === normalizedRight.value;
};

export const matchesIdentityScopedEntry = (
  entry: IdentityScopedEntry,
  target: NetworkUserIdentityTarget | null | undefined,
) => {
  if (!target || entry.networkId !== target.networkId) {
    return false;
  }
  const entryIdentity = normalizeNetworkUserIdentity(entry.identity);
  if (entryIdentity && entryIdentity.kind !== 'nick') {
    return isSameNetworkUserIdentity(entryIdentity, target.identity);
  }
  return isSameIrcIdentifier(entry.nick, target.nick);
};

const normalizeIdentityValue = (kind: UserIdentityKind, value: string) => {
  if (kind === 'account' || kind === 'nick') {
    return normalizeNickIdentity(value);
  }
  return normalizeStoredUserhost(value);
};

const normalizeStoredUserhost = (value: string) => {
  const separatorIndex = value.indexOf('@');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }
  return normalizeUserhostIdentity(
    value.slice(0, separatorIndex),
    value.slice(separatorIndex + 1),
  );
};
