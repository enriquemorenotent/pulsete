import { memo, useEffect, useMemo, useState } from 'react';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { ChatPane } from './ChatPane.js';
import { CommandPaletteDialog } from './CommandPaletteDialog.js';
import { openExistingNetworkEditor } from './network-editor-actions.js';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import {
  selectChannelList,
  selectChannelListNetwork,
  selectFriendPresence,
  selectFriends,
  selectGatewayStatus,
  selectHistoryHasOlderByBufferId,
  selectHistoryLoadedByBufferId,
  selectHistoryLoadingOlder,
  selectMutedNicks,
  selectNetworks,
  selectQueryPresence,
  selectSelectedMessages,
  selectServerProfileNetwork,
  selectSidebarConnections,
  selectWorkspace,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import { useDesktopCommandPaletteModel } from './useDesktopCommandPaletteModel.js';
import { useDesktopChatModel } from './useDesktopChatModel.js';
import {
  useDesktopNicklistModel,
  useDesktopSidebarModel,
} from './useDesktopShellModel.js';
import { useSelectedBufferEffects } from './useSelectedBufferEffects.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';

type SharedProps = {
  actions: AppActions;
  ui: AppUiState;
};

type ChatContainerProps = SharedProps & {
  applyServerMessages: ApplyServerMessages;
  backgroundDmAudio: import('./useBackgroundDmAudio.js').BackgroundDmAudioState;
  composer: ComposerStoreApi;
  primeBackgroundDmAudio: () => void;
};

type RightSidebarContainerProps = Pick<SharedProps, 'actions'> & {
  backgroundDmAudio: import('./useBackgroundDmAudio.js').BackgroundDmAudioState;
  primeBackgroundDmAudio: () => void;
};

export const ConnectionSidebarContainer = memo(function ConnectionSidebarContainer({
  actions,
  ui,
}: SharedProps) {
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const queryPresence = useAppSelector(selectQueryPresence);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const model = useDesktopSidebarModel({
    actions,
    friends,
    friendPresence,
    queryPresence,
    sidebarConnections,
    ui,
  });
  return <ConnectionSidebar {...model} />;
});

export const ChatPaneContainer = memo(function ChatPaneContainer({
  actions,
  applyServerMessages,
  backgroundDmAudio,
  composer,
  primeBackgroundDmAudio,
  ui,
}: ChatContainerProps) {
  const channelList = useAppSelector(selectChannelList);
  const channelListNetwork = useAppSelector(selectChannelListNetwork);
  const friends = useAppSelector(selectFriends);
  const gatewayStatus = useAppSelector(selectGatewayStatus);
  const historyHasOlderByBufferId = useAppSelector(selectHistoryHasOlderByBufferId);
  const historyLoadedByBufferId = useAppSelector(selectHistoryLoadedByBufferId);
  const historyLoadingOlder = useAppSelector(selectHistoryLoadingOlder);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const networks = useAppSelector(selectNetworks);
  const selectedMessages = useAppSelector(selectSelectedMessages);
  const workspace = useAppSelector(selectWorkspace);
  const dispatch = useAppDispatch();
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  const [windowFocused, setWindowFocused] = useState(() =>
    typeof document === 'undefined' ? true : document.hasFocus(),
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const handleVisibilityChange = () =>
      setDocumentVisible(document.visibilityState === 'visible');
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const selectedBufferHistory = useSelectedBufferEffects({
    applyServerMessages,
    dispatch,
    documentVisible,
    gatewayStatus,
    historyHasOlderByBufferId,
    historyLoadedByBufferId,
    historyLoadingOlder,
    selectedBuffer: workspace.selectedBuffer,
    selectedMessages,
    windowFocused,
  });
  const model = useDesktopChatModel({
    actions,
    backgroundDmAudio,
    composer,
    friends,
    mutedNicks,
    networks,
    primeBackgroundDmAudio,
    channelList,
    channelListNetwork,
    selectedBufferHistory,
    selectedMessages,
    workspace,
    ui,
  });
  return <ChatPane {...model} />;
});

export const WorkspaceRightSidebarContainer = memo(function WorkspaceRightSidebarContainer({
  actions,
  backgroundDmAudio,
  primeBackgroundDmAudio,
}: RightSidebarContainerProps) {
  const dispatch = useAppDispatch();
  const friends = useAppSelector(selectFriends);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const serverProfileNetwork = useAppSelector(selectServerProfileNetwork);
  const workspace = useAppSelector(selectWorkspace);
  const nicklist = useDesktopNicklistModel({
    actions,
    backgroundDmAudio,
    friends,
    mutedNicks,
    primeBackgroundDmAudio,
  });
  const serverProfile = useMemo(() => ({
    network: serverProfileNetwork,
    onEdit: () => {
      if (serverProfileNetwork) {
        openExistingNetworkEditor(serverProfileNetwork, {
          dispatch,
          initialTab: 'servers',
          returnMode: 'closed',
        });
      }
    },
  }), [dispatch, serverProfileNetwork]);
  return <WorkspaceRightSidebar workspace={workspace} nicklist={nicklist} serverProfile={serverProfile} />;
});

export const CommandPaletteDialogContainer = memo(function CommandPaletteDialogContainer({
  actions,
  ui,
}: SharedProps) {
  const dispatch = useAppDispatch();
  const friends = useAppSelector(selectFriends);
  const networks = useAppSelector(selectNetworks);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const workspace = useAppSelector(selectWorkspace);
  const model = useDesktopCommandPaletteModel({
    actions,
    dispatch,
    friends,
    networks,
    sidebarConnections,
    ui,
    workspace,
  });
  return <CommandPaletteDialog open={model.open} entries={model.entries} onClose={model.onClose} />;
});
