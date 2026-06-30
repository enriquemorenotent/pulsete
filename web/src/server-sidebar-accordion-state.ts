import { useCallback, useEffect, useState } from 'react';

export const SERVER_SIDEBAR_ACCORDION_STORAGE_KEY =
  'pulsete.serverProfile.accordions.v1';

export const serverSidebarAccordionIds = [
  'connection',
  'history',
  'capabilities',
  'notes',
] as const;

export type ServerSidebarAccordionId = typeof serverSidebarAccordionIds[number];

export type ServerSidebarAccordionState = Partial<Record<ServerSidebarAccordionId, boolean>>;

export type ServerSidebarAccordionController = {
  isOpen: (id: ServerSidebarAccordionId) => boolean;
  setOpen: (id: ServerSidebarAccordionId, open: boolean) => void;
};

type ServerSidebarAccordionSnapshot = {
  networkId: string | null;
  state: ServerSidebarAccordionState;
};

export const normalizeServerSidebarAccordionNetworkId = (
  networkId: string | null | undefined,
) => {
  const value = networkId?.trim() ?? '';
  return value || null;
};

export const getServerSidebarAccordionStorageKey = (
  networkId: string | null | undefined,
) => {
  const normalizedNetworkId = normalizeServerSidebarAccordionNetworkId(networkId);
  return normalizedNetworkId
    ? `${SERVER_SIDEBAR_ACCORDION_STORAGE_KEY}.${normalizedNetworkId}`
    : null;
};

export const isServerSidebarAccordionOpen = (
  state: ServerSidebarAccordionState,
  id: ServerSidebarAccordionId,
) => state[id] ?? true;

export const parseServerSidebarAccordionState = (
  value: string | null | undefined,
): ServerSidebarAccordionState => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const state: ServerSidebarAccordionState = {};
    for (const id of serverSidebarAccordionIds) {
      if (typeof record[id] === 'boolean') {
        state[id] = record[id];
      }
    }
    return state;
  } catch {
    return {};
  }
};

export const serializeServerSidebarAccordionState = (
  state: ServerSidebarAccordionState,
) => JSON.stringify(state);

export const readStoredServerSidebarAccordionState = (
  networkId: string | null | undefined,
) => {
  const storageKey = getServerSidebarAccordionStorageKey(networkId);
  if (!storageKey) {
    return {};
  }
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    return parseServerSidebarAccordionState(
      window.localStorage.getItem(storageKey),
    );
  } catch {
    return {};
  }
};

export const persistServerSidebarAccordionState = (
  networkId: string | null | undefined,
  state: ServerSidebarAccordionState,
) => {
  const storageKey = getServerSidebarAccordionStorageKey(networkId);
  if (!storageKey) {
    return;
  }
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      storageKey,
      serializeServerSidebarAccordionState(state),
    );
  } catch {
    // localStorage may be unavailable in private or embedded contexts.
  }
};

export function useServerSidebarAccordionState(
  networkIdInput: string | null | undefined,
): ServerSidebarAccordionController {
  const networkId = normalizeServerSidebarAccordionNetworkId(networkIdInput);
  const [snapshot, setSnapshot] = useState<ServerSidebarAccordionSnapshot>(
    () => ({
      networkId,
      state: readStoredServerSidebarAccordionState(networkId),
    }),
  );

  useEffect(() => {
    setSnapshot({
      networkId,
      state: readStoredServerSidebarAccordionState(networkId),
    });
  }, [networkId]);

  const isOpen = useCallback(
    (id: ServerSidebarAccordionId) => {
      const state = snapshot.networkId === networkId
        ? snapshot.state
        : readStoredServerSidebarAccordionState(networkId);
      return isServerSidebarAccordionOpen(state, id);
    },
    [networkId, snapshot],
  );
  const setOpen = useCallback((id: ServerSidebarAccordionId, open: boolean) => {
    setSnapshot((current) => {
      const currentState = current.networkId === networkId ? current.state : {};
      if (currentState[id] === open) {
        return current.networkId === networkId
          ? current
          : { networkId, state: currentState };
      }
      const state = { ...currentState, [id]: open };
      persistServerSidebarAccordionState(networkId, state);
      return { networkId, state };
    });
  }, [networkId]);

  return { isOpen, setOpen };
}
