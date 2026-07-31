import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { UserAvatarOverride } from '../../../shared/protocol-preferences.js';
import {
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

type AvatarOverridesContextValue = {
  overrides: UserAvatarOverride[];
  queryOverrides: QueryAvatarOverrides;
  userOverrides: UserAvatarOverrides;
  onRemove: (id: string) => void;
  onSave: (input: {
    networkId: string;
    nick: string;
    identity: UserAvatarOverrideTarget['identity'];
    dataUrl?: string;
    externalUrl?: string;
  }) => void;
};

const emptyQueryOverrides: QueryAvatarOverrides = {};
const emptyUserOverrides: UserAvatarOverrides = {};

const AvatarOverridesContext = createContext<AvatarOverridesContextValue>({
  overrides: [],
  queryOverrides: emptyQueryOverrides,
  userOverrides: emptyUserOverrides,
  onRemove: () => undefined,
  onSave: () => undefined,
});

export function AvatarOverridesProvider(props: {
  children: ReactNode;
  overrides: UserAvatarOverride[];
  onRemove: (id: string) => void;
  onSave: AvatarOverridesContextValue['onSave'];
}) {
  const userOverrides = useMemo(
    () => createUserAvatarOverrideMap(props.overrides),
    [props.overrides],
  );
  const value = useMemo<AvatarOverridesContextValue>(() => ({
    overrides: props.overrides,
    queryOverrides: emptyQueryOverrides,
    userOverrides,
    onRemove: props.onRemove,
    onSave: props.onSave,
  }), [props.onRemove, props.onSave, props.overrides, userOverrides]);
  return createElement(AvatarOverridesContext.Provider, { value }, props.children);
}

export const createUserAvatarOverrideMap = (
  overrides: readonly UserAvatarOverride[],
): UserAvatarOverrides => Object.fromEntries(
  overrides.flatMap((override) => {
    const key = resolveUserAvatarOverrideKey({
      networkId: override.networkId,
      nick: override.nick,
      identity: override.identity,
    }, { allowNickFallback: true });
    return key ? [[key, override.imageUrl]] : [];
  }),
);

export function useUserAvatarOverrides() {
  return useContext(AvatarOverridesContext).userOverrides;
}

export function useQueryAvatarOverrides() {
  return useContext(AvatarOverridesContext).queryOverrides;
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
  target: UserAvatarOverrideTarget | null;
}) {
  const context = useContext(AvatarOverridesContext);
  const key = resolveUserAvatarOverrideKey(input.target, {
    allowNickFallback: input.allowNickFallback,
  });
  const existing = key
    ? context.overrides.find((override) => resolveUserAvatarOverrideKey({
        networkId: override.networkId,
        nick: override.nick,
        identity: override.identity,
      }, { allowNickFallback: true }) === key) ?? null
    : null;
  const url = key ? context.userOverrides[key] ?? null : null;
  const setUrl = useCallback((nextUrl: string | null) => {
    if (!input.target) {
      return;
    }
    if (!nextUrl) {
      if (existing) {
        context.onRemove(existing.id);
      }
      return;
    }
    const source = nextUrl.startsWith('data:')
      ? { dataUrl: nextUrl }
      : { externalUrl: nextUrl };
    context.onSave({
      networkId: input.target.networkId,
      nick: input.target.nick,
      identity: input.target.identity,
      ...source,
    });
  }, [context, existing, input.target]);
  return { url, setUrl };
}
