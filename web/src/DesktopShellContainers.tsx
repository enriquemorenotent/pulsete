import { memo } from 'react';
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
  selectHistoryLoadedByBufferId,
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
import type { MediaVisibilityPolicy } from './media-visibility-settings.js';
import { useDesktopCommandPaletteModel } from './useDesktopCommandPaletteModel.js';
import { useDesktopChatModel } from './useDesktopChatModel.js';
import { useDesktopSidebarModel } from './useDesktopShellModel.js';
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
  mediaPolicy: MediaVisibilityPolicy;
};

type ChatContainerProps = Pick<SharedProps, 'actions'> & {
  applyServerMessages: ApplyServerMessages;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  mediaPolicy: MediaVisibilityPolicy;
  jumpToLatestRequestId: number;
};

type CommandPaletteContainerProps = SharedProps & {
  externalAvatarsEnabled: boolean;
  mediaPolicy: MediaVisibilityPolicy;
};

export const ConnectionSidebarContainer = memo(function ConnectionSidebarContainer({
  actions,
  externalAvatarsEnabled,
  mediaPolicy,
  ui,
}: SidebarContainerProps) {
  const friends = useAppSelector(selectFriends);
  const friendPresence = useAppSelector(selectFriendPresence);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const queryPresence = useAppSelector(selectQueryPresence);
  const sidebarConnections = useAppSelector(selectSidebarConnections);
  const model = useDesktopSidebarModel({
    actions,
    externalAvatarsEnabled,
    friends,
    friendPresence,
    mediaPolicy,
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
  mediaPolicy,
  jumpToLatestRequestId,
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
    mediaPolicy,
    mutedNicks,
    nickEmojis,
    networks,
    channelList,
    channelListNetwork,
    selectedBufferHistory,
    selectedMessages,
    workspace,
  });
  return <ChatPane {...model} jumpToLatestRequestId={jumpToLatestRequestId} />;
});

export const CommandPaletteDialogContainer = memo(function CommandPaletteDialogContainer({
  actions,
  externalAvatarsEnabled,
  mediaPolicy,
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
    mediaPolicy,
    nickEmojis,
    networks,
    sidebarConnections,
    ui,
    workspace,
  });
  return <CommandPaletteDialog open={model.open} entries={model.entries} onClose={model.onClose} />;
});
