import { useCallback, useEffect, useRef, useState } from 'react';
import type { SocketHandle } from './client.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export type BufferToolDialogKind = 'history-import' | 'self-aliases';

export type BufferToolDialogState = {
  kind: BufferToolDialogKind;
  bufferId: string;
} | null;

export type AppUiState = {
  bufferToolDialog: BufferToolDialogState;
  closeBufferToolDialog: () => void;
  closeCommandPalette: () => void;
  closePreferences: () => void;
  commandPaletteOpen: boolean;
  didAutoOpenManagerRef: { current: boolean };
  hideOfflineFriends: boolean;
  messageDisplayMode: MessageDisplayMode;
  openBufferToolDialog: (kind: BufferToolDialogKind, bufferId: string) => void;
  openCommandPalette: () => void;
  openPreferences: () => void;
  preferencesOpen: boolean;
  setMessageDisplayMode: (mode: MessageDisplayMode) => void;
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
  const [bufferToolDialog, setBufferToolDialog] = useState<BufferToolDialogState>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [hideOfflineFriends, setHideOfflineFriends] = useState(
    readStoredHideOfflineFriendsPreference,
  );
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>('colors');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const socketRef = useRef<SocketHandle | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  useEffect(() => {
    persistHideOfflineFriendsPreference(hideOfflineFriends);
  }, [hideOfflineFriends]);

  const closeBufferToolDialog = useCallback(() => setBufferToolDialog(null), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);
  const openBufferToolDialog = useCallback((kind: BufferToolDialogKind, bufferId: string) => {
    setBufferToolDialog({ kind, bufferId });
  }, []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const openPreferences = useCallback(() => setPreferencesOpen(true), []);
  const toggleHideOfflineFriends = useCallback(
    () => setHideOfflineFriends((value) => !value),
    [],
  );

  return {
    bufferToolDialog,
    closeBufferToolDialog,
    closeCommandPalette,
    closePreferences,
    commandPaletteOpen,
    didAutoOpenManagerRef,
    hideOfflineFriends,
    messageDisplayMode,
    openBufferToolDialog,
    openCommandPalette,
    openPreferences,
    preferencesOpen,
    setMessageDisplayMode,
    socketRef,
    toggleHideOfflineFriends,
  };
}
