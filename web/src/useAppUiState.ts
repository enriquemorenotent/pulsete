import { useRef, useState } from 'react';
import type { SocketHandle } from './client.js';
import type { MessageDisplayMode } from './message-display-mode.js';

export type AppUiState = {
  didAutoOpenManagerRef: { current: boolean };
  messageDisplayMode: MessageDisplayMode;
  scrollRef: { current: HTMLDivElement | null };
  setMessageDisplayMode: (mode: MessageDisplayMode) => void;
  socketRef: { current: SocketHandle | null };
};

export function useAppUiState(): AppUiState {
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>('colors');
  const socketRef = useRef<SocketHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  return {
    didAutoOpenManagerRef,
    messageDisplayMode,
    scrollRef,
    setMessageDisplayMode,
    socketRef,
  };
}
