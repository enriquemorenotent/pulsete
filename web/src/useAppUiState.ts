import { useCallback, useEffect, useRef, useState } from 'react';
import type { SocketHandle } from './client.js';

export type AppUiState = {
  closeCommandPalette: () => void;
  closePreferences: () => void;
  commandPaletteOpen: boolean;
  didAutoOpenManagerRef: { current: boolean };
  hideOfflineFriends: boolean;
  openCommandPalette: () => void;
  openPreferences: () => void;
  preferencesOpen: boolean;
  socketRef: { current: SocketHandle | null };
  toggleHideOfflineFriends: () => void;
};

export const HIDE_OFFLINE_FRIENDS_STORAGE_KEY =
  'pulsete.hideOfflineFriends';

export const parseHideOfflineFriendsPreference = (
  value: string | null,
) => value === 'true';

export const readStoredHideOfflineFriendsPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return parseHideOfflineFriendsPreference(
      window.localStorage.getItem(HIDE_OFFLINE_FRIENDS_STORAGE_KEY),
    );
  } catch {
    return false;
  }
};

export const persistHideOfflineFriendsPreference = (value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      HIDE_OFFLINE_FRIENDS_STORAGE_KEY,
      String(value),
    );
  } catch {
    return;
  }
};

export function useAppUiState(): AppUiState {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [hideOfflineFriends, setHideOfflineFriends] = useState(
    readStoredHideOfflineFriendsPreference,
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const socketRef = useRef<SocketHandle | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  useEffect(() => {
    persistHideOfflineFriendsPreference(hideOfflineFriends);
  }, [hideOfflineFriends]);

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const toggleHideOfflineFriends = useCallback(
    () => setHideOfflineFriends((value) => !value),
    [],
  );

  return {
    closeCommandPalette,
    closePreferences,
    commandPaletteOpen,
    didAutoOpenManagerRef,
    hideOfflineFriends,
    openCommandPalette,
    openPreferences,
    preferencesOpen,
    socketRef,
    toggleHideOfflineFriends,
  };
}
