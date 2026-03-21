import { useRef, useState } from 'react';
import type { SocketHandle } from './client.js';
import type { MessageDisplayMode } from './message-display-mode.js';
import type { EditorTab } from './network-form.js';

export function useAppUiState() {
  const [showNetworkManager, setShowNetworkManager] = useState(false);
  const [showNetworkEditor, setShowNetworkEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('servers');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>('colors');
  const [managedNetworkId, setManagedNetworkId] = useState<string | null>(null);
  const socketRef = useRef<SocketHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoOpenManagerRef = useRef(false);

  return {
    didAutoOpenManagerRef,
    editorTab,
    managedNetworkId,
    messageDisplayMode,
    scrollRef,
    setEditorTab,
    setManagedNetworkId,
    setMessageDisplayMode,
    setShowFavoritesOnly,
    setShowNetworkEditor,
    setShowNetworkManager,
    showFavoritesOnly,
    showNetworkEditor,
    showNetworkManager,
    socketRef,
  };
}
