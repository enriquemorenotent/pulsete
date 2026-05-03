import { memo, useEffect, useMemo, useState } from 'react';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { ChatPane } from './ChatPane.js';
import { CommandPaletteDialog } from './CommandPaletteDialog.js';
import { openExistingNetworkEditor } from './network-editor-actions.js';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import {
  selectChannels,
  selectChannelList,
  selectChannelListNetwork,
  selectFriendPresence,
  selectFriends,
  selectGatewayStatus,
  selectHistoryHasOlderByBufferId,
  selectHistoryLoadedByBufferId,
  selectMutedNicks,
  selectNetworks,
  selectNickEmojis,
  selectQueryPresence,
  selectSelectedMessages,
  selectServerProfileNetwork,
  selectSidebarConnections,
  selectWorkspace,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ApplyServerMessages } from './app-actions-types.js';
import type { ComposerStoreApi } from './composer-store.js';
import type { ContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import { useDesktopCommandPaletteModel } from './useDesktopCommandPaletteModel.js';
import { useDesktopChatModel } from './useDesktopChatModel.js';
import {
  useDesktopNicklistModel,
  useDesktopSidebarModel,
} from './useDesktopShellModel.js';
import { useSelectedBufferHistory } from './transcript/history.js';
import { useSelectedBufferReadReceipt } from './transcript/read-receipt.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import { findNickEmoji } from './nick-emoji-utils.js';
import { resolveUserAvatarCandidate } from './user-avatars/irccloud.js';

type SharedProps = {
  actions: AppActions;
  ui: AppUiState;
};

type ChatContainerProps = Pick<SharedProps, 'actions'> & {
  applyServerMessages: ApplyServerMessages;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
};

type RightSidebarContainerProps = Pick<SharedProps, 'actions'> & {
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
};

export const ConnectionSidebarContainer = memo(function ConnectionSidebarContainer({
  actions,
  ui,
}: SharedProps) {
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const queryPresence = useAppSelector(selectQueryPresence);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const model = useDesktopSidebarModel({
    actions,
    friends,
    friendPresence,
    nickEmojis,
    queryPresence,
    sidebarConnections,
    ui,
  });
  return <ConnectionSidebar {...model} />;
});

export const ChatPaneContainer = memo(function ChatPaneContainer({
  actions,
  applyServerMessages,
  composer,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
}: ChatContainerProps) {
  const channels = useAppSelector(selectChannels);
  const channelList = useAppSelector(selectChannelList);
  const channelListNetwork = useAppSelector(selectChannelListNetwork);
  const friends = useAppSelector(selectFriends);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const gatewayStatus = useAppSelector(selectGatewayStatus);
  const historyHasOlderByBufferId = useAppSelector(selectHistoryHasOlderByBufferId);
  const historyLoadedByBufferId = useAppSelector(selectHistoryLoadedByBufferId);
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

  useSelectedBufferReadReceipt({
    applyServerMessages,
    documentVisible,
    selectedBuffer: workspace.selectedBuffer,
    windowFocused,
  });
  const selectedBufferHistory = useSelectedBufferHistory({
    dispatch,
    gatewayStatus,
    historyHasOlderByBufferId,
    historyLoadedByBufferId,
    selectedBuffer: workspace.selectedBuffer,
    selectedMessages,
  });
  const model = useDesktopChatModel({
    actions,
    composer,
    contactNotifications,
    contactRuleHandlers,
    channels,
    externalAvatarsEnabled,
    friends,
    mutedNicks,
    nickEmojis,
    networks,
    channelList,
    channelListNetwork,
    selectedBufferHistory,
    selectedMessages,
    workspace,
  });
  return <ChatPane {...model} />;
});

export const WorkspaceRightSidebarContainer = memo(function WorkspaceRightSidebarContainer({
  actions,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
}: RightSidebarContainerProps) {
  const dispatch = useAppDispatch();
  const channels = useAppSelector(selectChannels);
  const friends = useAppSelector(selectFriends);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const serverProfileNetwork = useAppSelector(selectServerProfileNetwork);
  const workspace = useAppSelector(selectWorkspace);
  const nicklist = useDesktopNicklistModel({
    actions,
    contactNotifications,
    contactRuleHandlers,
    externalAvatarsEnabled,
    friends,
    mutedNicks,
    nickEmojis,
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
    onSaveNotes: actions.saveNetworkNotes,
  }), [actions.saveNetworkNotes, dispatch, serverProfileNetwork]);
  const queryProfile = useMemo(() => {
    const buffer = workspace.selectedBuffer?.kind === 'query' ? workspace.selectedBuffer : null;
    const user = buffer
      ? resolveUserAvatarCandidate(channels, buffer.networkId, buffer.target)
      : null;
    return {
      buffer,
      identity: user?.identity,
      nickEmoji: buffer
        ? findNickEmoji(nickEmojis, buffer.networkId, buffer.target, user?.identity)
        : null,
      network: workspace.selectedNetwork,
      onSaveNotes: actions.saveBufferNotes,
      onSaveNickEmoji: actions.saveNickEmoji,
    };
  }, [
    actions.saveBufferNotes,
    actions.saveNickEmoji,
    channels,
    nickEmojis,
    workspace.selectedBuffer,
    workspace.selectedNetwork,
  ]);
  return (
    <WorkspaceRightSidebar
      workspace={workspace}
      nicklist={nicklist}
      serverProfile={serverProfile}
      queryProfile={queryProfile}
    />
  );
});

export const CommandPaletteDialogContainer = memo(function CommandPaletteDialogContainer({
  actions,
  ui,
}: SharedProps) {
  const dispatch = useAppDispatch();
  const friends = useAppSelector(selectFriends);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const networks = useAppSelector(selectNetworks);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const workspace = useAppSelector(selectWorkspace);
  const model = useDesktopCommandPaletteModel({
    actions,
    dispatch,
    friends,
    nickEmojis,
    networks,
    sidebarConnections,
    ui,
    workspace,
  });
  return <CommandPaletteDialog open={model.open} entries={model.entries} onClose={model.onClose} />;
});
