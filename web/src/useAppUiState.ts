import { useCallback, useRef, useState } from 'react';
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
  forceScrollToBottomRef: { current: (() => void) | null };
  messageDisplayMode: MessageDisplayMode;
  openBufferToolDialog: (kind: BufferToolDialogKind, bufferId: string) => void;
  openCommandPalette: () => void;
  openPreferences: () => void;
  preferencesOpen: boolean;
  scrollRef: { current: HTMLDivElement | null };
  setMessageDisplayMode: (mode: MessageDisplayMode) => void;
  socketRef: { current: SocketHandle | null };
};

export function useAppUiState(): AppUiState {
  const [bufferToolDialog, setBufferToolDialog] = useState<BufferToolDialogState>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>('colors');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const forceScrollToBottomRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<SocketHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenManagerRef = useRef(false);
  const closeBufferToolDialog = useCallback(() => setBufferToolDialog(null), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);
  const closePreferences = useCallback(() => setPreferencesOpen(false), []);
  const openBufferToolDialog = useCallback((kind: BufferToolDialogKind, bufferId: string) => {
    setBufferToolDialog({ kind, bufferId });
  }, []);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const openPreferences = useCallback(() => setPreferencesOpen(true), []);

  return {
    bufferToolDialog,
    closeBufferToolDialog,
    closeCommandPalette,
    closePreferences,
    commandPaletteOpen,
    didAutoOpenManagerRef,
    forceScrollToBottomRef,
    messageDisplayMode,
    openBufferToolDialog,
    openCommandPalette,
    openPreferences,
    preferencesOpen,
    scrollRef,
    setMessageDisplayMode,
    socketRef,
  };
}
