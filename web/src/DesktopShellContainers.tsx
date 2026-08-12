import { memo, useMemo } from 'react';
import { ConnectionSidebar } from './ConnectionSidebar.js';
import { ChatPane } from './ChatPane.js';
import { CommandPaletteDialog } from './CommandPaletteDialog.js';
import {
  selectChannels,
  selectChannelList,
  selectChannelListNetwork,
  selectFriendPresence,
  selectFriends,
  selectGatewayStatus,
  selectHistoryHasOlderByBufferId,
  selectHistoryHasNewerByBufferId,
  selectHistoryLoadedByBufferId,
  selectMessageFocusRequest,
  selectMutedNicks,
  selectNetworks,
  selectNickEmojis,
  selectQueryPresence,
  selectSelectedMessages,
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
import { useSelectedBufferHistory } from './transcript/history.js';
import { useSelectedBufferReadReceipt } from './transcript/read-receipt.js';
import type { AppActions } from './useAppActions.js';
import type { AppUiState } from './useAppUiState.js';
import { useDocumentActivityState } from './useDocumentActivityState.js';

type SharedProps = {
  actions: AppActions;
  ui: AppUiState;
};

type SidebarContainerProps = SharedProps & {
  externalAvatarsEnabled: boolean;
  showMedia: boolean;
};

type ChatContainerProps = Pick<SharedProps, 'actions'> & {
  applyServerMessages: ApplyServerMessages;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  showMedia: boolean;
  jumpToLatestRequestId: number;
};

type CommandPaletteContainerProps = SharedProps & {
  externalAvatarsEnabled: boolean;
  showMedia: boolean;
};

export const ConnectionSidebarContainer = memo(function ConnectionSidebarContainer({
  actions,
  externalAvatarsEnabled,
  showMedia,
  ui,
}: SidebarContainerProps) {
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const queryPresence = useAppSelector(selectQueryPresence);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const model = useMemo(() => ({
    connections: sidebarConnections,
    externalAvatarsEnabled,
    friends,
    friendPresence,
    hideOfflineFriends: ui.hideOfflineFriends,
    showMedia,
    nickEmojis,
    queryPresence,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectFriend: actions.selectFriend,
    onToggleHideOfflineFriends: ui.toggleHideOfflineFriends,
    onSelectNetwork: actions.selectNetworkBuffer,
    onSelectBuffer: actions.selectTabBuffer,
    onSelectPendingChannel: actions.selectPendingTab,
    onReconnectNetwork: actions.reconnectNetwork,
    onDisconnectNetwork: actions.disconnectNetwork,
    onCloseConnection: actions.closeConnection,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  }), [
    actions,
    externalAvatarsEnabled,
    friendPresence,
    friends,
    showMedia,
    nickEmojis,
    queryPresence,
    sidebarConnections,
    ui.hideOfflineFriends,
    ui.toggleHideOfflineFriends,
  ]);
  return <ConnectionSidebar {...model} />;
});

export const ChatPaneContainer = memo(function ChatPaneContainer({
  actions,
  applyServerMessages,
  composer,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
  showMedia,
  jumpToLatestRequestId,
}: ChatContainerProps) {
  const channels = useAppSelector(selectChannels);
  const channelList = useAppSelector(selectChannelList);
  const channelListNetwork = useAppSelector(selectChannelListNetwork);
  const friends = useAppSelector(selectFriends);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const gatewayStatus = useAppSelector(selectGatewayStatus);
  const historyHasOlderByBufferId = useAppSelector(selectHistoryHasOlderByBufferId);
  const historyHasNewerByBufferId = useAppSelector(selectHistoryHasNewerByBufferId);
  const historyLoadedByBufferId = useAppSelector(selectHistoryLoadedByBufferId);
  const messageFocusRequest = useAppSelector(selectMessageFocusRequest);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const networks = useAppSelector(selectNetworks);
  const selectedMessages = useAppSelector(selectSelectedMessages);
  const workspace = useAppSelector(selectWorkspace);
  const dispatch = useAppDispatch();
  const { documentVisible, windowFocused } = useDocumentActivityState();

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
    historyHasNewerByBufferId,
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
    friends,
    externalAvatarsEnabled,
    showMedia,
    mutedNicks,
    nickEmojis,
    networks,
    channelList,
    channelListNetwork,
    messageFocusRequest,
    selectedBufferHistory,
    selectedMessages,
    workspace,
  });
  return <ChatPane {...model} jumpToLatestRequestId={jumpToLatestRequestId} />;
});

export const CommandPaletteDialogContainer = memo(function CommandPaletteDialogContainer({
  actions,
  externalAvatarsEnabled,
  showMedia,
  ui,
}: CommandPaletteContainerProps) {
  const dispatch = useAppDispatch();
  const friends = useAppSelector(selectFriends);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const networks = useAppSelector(selectNetworks);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const workspace = useAppSelector(selectWorkspace);
  const model = useDesktopCommandPaletteModel({
    actions,
    dispatch,
    externalAvatarsEnabled,
    friends,
    showMedia,
    nickEmojis,
    networks,
    sidebarConnections,
    ui,
    workspace,
  });
  return <CommandPaletteDialog open={model.open} entries={model.entries} onClose={model.onClose} />;
});
