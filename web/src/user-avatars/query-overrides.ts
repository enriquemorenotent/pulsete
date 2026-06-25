import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  QUERY_AVATAR_OVERRIDES_STORAGE_KEY,
  USER_AVATAR_OVERRIDES_STORAGE_KEY,
  normalizeAvatarUrl,
  parseQueryAvatarOverrides,
  parseUserAvatarOverrides,
  resolveUserAvatarOverrideKey,
  resolveUserAvatarOverrideUrl,
  serializeQueryAvatarOverrides,
  serializeUserAvatarOverrides,
  type QueryAvatarOverrides,
  type UserAvatarOverrides,
  type UserAvatarOverrideTarget,
} from './override-model.js';

export {
  QUERY_AVATAR_OVERRIDES_STORAGE_KEY,
  USER_AVATAR_OVERRIDES_STORAGE_KEY,
  parseQueryAvatarOverrides,
  parseUserAvatarOverrides,
  resolveUserAvatarOverrideKey,
  resolveUserAvatarOverrideUrl,
  serializeQueryAvatarOverrides,
  serializeUserAvatarOverrides,
  type QueryAvatarOverrides,
  type UserAvatarOverrides,
  type UserAvatarOverrideTarget,
} from './override-model.js';

const emptyQueryOverrides: QueryAvatarOverrides = {};
const emptyUserOverrides: UserAvatarOverrides = {};
const listeners = new Set<() => void>();
let queryOverridesSnapshot: QueryAvatarOverrides | null = null;
let userOverridesSnapshot: UserAvatarOverrides | null = null;

export const readStoredQueryAvatarOverrides = () => {
  if (typeof window === 'undefined') {
    return emptyQueryOverrides;
  }
  if (!queryOverridesSnapshot) {
    queryOverridesSnapshot = parseQueryAvatarOverrides(
      window.localStorage.getItem(QUERY_AVATAR_OVERRIDES_STORAGE_KEY),
    );
  }
  return queryOverridesSnapshot;
};

export const readStoredUserAvatarOverrides = () => {
  if (typeof window === 'undefined') {
    return emptyUserOverrides;
  }
  if (!userOverridesSnapshot) {
    userOverridesSnapshot = parseUserAvatarOverrides(
      window.localStorage.getItem(USER_AVATAR_OVERRIDES_STORAGE_KEY),
    );
  }
  return userOverridesSnapshot;
};

export function useUserAvatarOverrides() {
  return useSyncExternalStore(
    subscribeToAvatarOverrides,
    readStoredUserAvatarOverrides,
    () => emptyUserOverrides,
  );
}

export function useQueryAvatarOverrides() {
  return useSyncExternalStore(
    subscribeToAvatarOverrides,
    readStoredQueryAvatarOverrides,
    () => emptyQueryOverrides,
  );
}

export function useUserAvatarOverrideUrl(
  target: UserAvatarOverrideTarget | null | undefined,
  options: { allowNickFallback?: boolean; legacyBufferId?: string | null } = {},
) {
  return resolveUserAvatarOverrideUrl({
    allowNickFallback: options.allowNickFallback,
    legacyBufferId: options.legacyBufferId,
    queryAvatarOverrides: useQueryAvatarOverrides(),
    target,
    userAvatarOverrides: useUserAvatarOverrides(),
  });
}

export function useQueryAvatarOverride(input: {
  allowNickFallback?: boolean;
  bufferId: string | null;
  target: UserAvatarOverrideTarget | null;
}) {
  const queryOverrides = useQueryAvatarOverrides();
  const userOverrides = useUserAvatarOverrides();
  const key = resolveUserAvatarOverrideKey(input.target, {
    allowNickFallback: input.allowNickFallback,
  });
  const legacyUrl = input.bufferId ? queryOverrides[input.bufferId] ?? null : null;
  const userUrl = key ? userOverrides[key] ?? null : null;

  useEffect(() => {
    if (key && legacyUrl && !userUrl) {
      setStoredUserAvatarOverrideByKey(key, legacyUrl);
    }
  }, [key, legacyUrl, userUrl]);

  const setUrl = useCallback((url: string | null) => {
    if (input.target) {
      setStoredUserAvatarOverride(input.target, url, {
        allowNickFallback: input.allowNickFallback,
      });
    }
    if (input.bufferId) {
      setStoredQueryAvatarOverride(input.bufferId, url);
    }
  }, [input.allowNickFallback, input.bufferId, input.target]);

  return { url: userUrl ?? legacyUrl, setUrl };
}

export const setStoredUserAvatarOverride = (
  target: UserAvatarOverrideTarget,
  url: string | null,
  options: { allowNickFallback?: boolean } = {},
) => {
  const key = resolveUserAvatarOverrideKey(target, options);
  if (key) {
    setStoredUserAvatarOverrideByKey(key, url);
  }
};

const setStoredQueryAvatarOverride = (bufferId: string, url: string | null) => {
  const key = bufferId.trim();
  if (!key) {
    return;
  }
  const next = { ...readStoredQueryAvatarOverrides() };
  const nextUrl = normalizeAvatarUrl(url);
  if (nextUrl) {
    next[key] = nextUrl;
  } else {
    delete next[key];
  }
  queryOverridesSnapshot = sanitizeQueryOverrides(next);
  writeStorage(QUERY_AVATAR_OVERRIDES_STORAGE_KEY, serializeQueryAvatarOverrides(queryOverridesSnapshot));
  notifyAvatarOverrideListeners();
};

const setStoredUserAvatarOverrideByKey = (key: string, url: string | null) => {
  const next = { ...readStoredUserAvatarOverrides() };
  const nextUrl = normalizeAvatarUrl(url);
  if (nextUrl) {
    next[key] = nextUrl;
  } else {
    delete next[key];
  }
  userOverridesSnapshot = sanitizeUserOverrides(next);
  writeStorage(USER_AVATAR_OVERRIDES_STORAGE_KEY, serializeUserAvatarOverrides(userOverridesSnapshot));
  notifyAvatarOverrideListeners();
};

const subscribeToAvatarOverrides = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyAvatarOverrideListeners = () => {
  for (const listener of listeners) {
    listener();
  }
};

const writeStorage = (key: string, value: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage may be unavailable or full after large image uploads.
  }
};

const sanitizeQueryOverrides = (overrides: QueryAvatarOverrides) =>
  parseQueryAvatarOverrides(serializeQueryAvatarOverrides(overrides));

const sanitizeUserOverrides = (overrides: UserAvatarOverrides) =>
  parseUserAvatarOverrides(serializeUserAvatarOverrides(overrides));
