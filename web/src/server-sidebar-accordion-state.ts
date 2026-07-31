import { useCallback } from 'react';

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

export function useServerSidebarAccordionState(
  networkIdInput: string | null | undefined,
  state: ServerSidebarAccordionState = {},
  onChange: (state: ServerSidebarAccordionState) => void = () => undefined,
): ServerSidebarAccordionController {
  const networkId = normalizeServerSidebarAccordionNetworkId(networkIdInput);
  const isOpen = useCallback(
    (id: ServerSidebarAccordionId) => isServerSidebarAccordionOpen(state, id),
    [state],
  );
  const setOpen = useCallback((id: ServerSidebarAccordionId, open: boolean) => {
    if (networkId && state[id] !== open) {
      onChange({ ...state, [id]: open });
    }
  }, [networkId, onChange, state]);

  return { isOpen, setOpen };
}
