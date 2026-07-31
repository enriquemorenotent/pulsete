import {
  normalizeNetworkUserIdentity,
  normalizeNickIdentity,
  resolveNetworkUserIdentity,
  type NetworkUserIdentity,
  type UserIdentitySource,
} from '../../../shared/user-identity.js';

export type QueryAvatarOverrides = Record<string, string>;
export type UserAvatarOverrides = Record<string, string>;

export type UserAvatarOverrideTarget = {
  identity?: NetworkUserIdentity | null;
  networkId: string;
  nick: string;
};

export const QUERY_AVATAR_OVERRIDES_STORAGE_KEY =
  'pulsete.userAvatars.queryOverrides.v1';

export const USER_AVATAR_OVERRIDES_STORAGE_KEY =
  'pulsete.userAvatars.identityOverrides.v1';

type UserAvatarSource = UserIdentitySource & {
  identity?: NetworkUserIdentity | null;
};

export const normalizeAvatarUrl = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const parseQueryAvatarOverrides = (
  value: string | null | undefined,
): QueryAvatarOverrides => parseAvatarOverrideRecord(value);

export const serializeQueryAvatarOverrides = (overrides: QueryAvatarOverrides) =>
  serializeAvatarOverrideRecord(overrides);

export const parseUserAvatarOverrides = (
  value: string | null | undefined,
): UserAvatarOverrides => parseAvatarOverrideRecord(value);

export const serializeUserAvatarOverrides = (overrides: UserAvatarOverrides) =>
  serializeAvatarOverrideRecord(overrides);

export const resolveUserAvatarTarget = (
  networkId: string,
  source: UserAvatarSource,
): UserAvatarOverrideTarget | null => {
  const normalizedNetworkId = networkId.trim();
  const nick = source.nick?.trim() ?? '';
  if (!normalizedNetworkId || !nick) {
    return null;
  }
  return {
    networkId: normalizedNetworkId,
    nick,
    identity:
      normalizeNetworkUserIdentity(source.identity)
      ?? resolveNetworkUserIdentity(source),
  };
};

export const resolveUserAvatarOverrideKey = (
  target: UserAvatarOverrideTarget | null | undefined,
  options: { allowNickFallback?: boolean } = {},
) => {
  if (!target) {
    return null;
  }
  const networkId = target.networkId.trim();
  if (!networkId) {
    return null;
  }
  const identity = normalizeNetworkUserIdentity(target.identity);
  if (identity && (identity.kind !== 'nick' || options.allowNickFallback)) {
    return buildAvatarOverrideKey(networkId, identity.kind, identity.value);
  }
  if (!options.allowNickFallback) {
    return null;
  }
  const nick = normalizeNickIdentity(target.nick);
  return nick ? buildAvatarOverrideKey(networkId, 'nick', nick) : null;
};

export const parseUserAvatarOverrideKey = (value: string) => {
  const parts = value.split('|');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const networkId = decodeURIComponent(parts[0]).trim();
    const kind = decodeURIComponent(parts[1]);
    const identityValue = decodeURIComponent(parts[2]).trim();
    if (
      !networkId
      || !identityValue
      || (kind !== 'account' && kind !== 'userhost' && kind !== 'nick')
    ) {
      return null;
    }
    return {
      networkId,
      identity: { kind, value: identityValue },
      nick: kind === 'nick' ? identityValue : identityValue,
    } as UserAvatarOverrideTarget;
  } catch {
    return null;
  }
};

export const resolveUserAvatarOverrideUrl = (input: {
  allowNickFallback?: boolean;
  legacyBufferId?: string | null;
  queryAvatarOverrides?: QueryAvatarOverrides;
  target: UserAvatarOverrideTarget | null | undefined;
  userAvatarOverrides?: UserAvatarOverrides;
}) => {
  const key = resolveUserAvatarOverrideKey(input.target, {
    allowNickFallback: input.allowNickFallback,
  });
  const identityUrl = key ? input.userAvatarOverrides?.[key] ?? null : null;
  if (identityUrl) {
    return identityUrl;
  }
  const bufferId = input.legacyBufferId?.trim();
  return bufferId ? input.queryAvatarOverrides?.[bufferId] ?? null : null;
};

const parseAvatarOverrideRecord = (value: string | null | undefined) => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!parsed || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, url]) => [key.trim(), normalizeAvatarUrl(url)] as const)
        .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
    );
  } catch {
    return {};
  }
};

const serializeAvatarOverrideRecord = (
  overrides: Record<string, string>,
) => JSON.stringify(
  Object.fromEntries(
    Object.entries(overrides)
      .map(([key, url]) => [key.trim(), normalizeAvatarUrl(url)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1]))
      .sort(([left], [right]) => left.localeCompare(right)),
  ),
);

const buildAvatarOverrideKey = (
  networkId: string,
  identityKind: NetworkUserIdentity['kind'],
  value: string,
) => [
  encodeURIComponent(networkId),
  encodeURIComponent(identityKind),
  encodeURIComponent(value),
].join('|');
