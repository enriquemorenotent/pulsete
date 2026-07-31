import { useCallback, useRef, useState } from 'react';
import type { SocketHandle } from './client.js';

export type AppTransientUiState = {
  closeCommandPalette: () => void;
  closeLogInspector: () => void;
  closePreferences: () => void;
  commandPaletteOpen: boolean;
  didAutoOpenManagerRef: { current: boolean };
  logInspectorOpen: boolean;
  openCommandPalette: () => void;
  openLogInspector: () => void;
  openPreferences: () => void;
  preferencesOpen: boolean;
  socketRef: { current: SocketHandle | null };
};

export type AppUiState = AppTransientUiState & {
  hideOfflineFriends: boolean;
  toggleHideOfflineFriends: () => void;
};

export const HIDE_OFFLINE_FRIENDS_STORAGE_KEY =
  'pulsete.hideOfflineFriends';

export const parseHideOfflineFriendsPreference = (
  value: string | null,
) => value === 'true';

export function useAppUiState(): AppTransientUiState {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [logInspectorOpen, setLogInspectorOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const socketRef = useRef<SocketHandle | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const closeLogInspector = useCallback(() => setLogInspectorOpen(false), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const openLogInspector = useCallback(() => setLogInspectorOpen(true), []);
  const openPreferences = useCallback(() => setPreferencesOpen(true), []);

  return {
    closeCommandPalette,
    closeLogInspector,
    closePreferences,
    commandPaletteOpen,
    didAutoOpenManagerRef,
    logInspectorOpen,
    openCommandPalette,
    openLogInspector,
    openPreferences,
    preferencesOpen,
    socketRef,
  };
}
