import { useMemo } from 'react';
import type { ChatPaneProps } from './ChatPane.js';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { ComposerController } from './composer-history.js';
import type { AppUiState } from './useAppUiState.js';
import type { ChatActionSet, NicklistActionSet, SidebarActionSet } from './useAppActions.js';
import type { WorkspaceView } from './workspace-types.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  ui: Pick<AppUiState, 'messageDisplayMode' | 'openPreferences' | 'setMessageDisplayMode'>;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  sidebarConnections: ConnectionSidebarProps['connections'];
};

type DesktopChatModelParams = {
  actions: ChatActionSet;
  composer: ComposerController;
  friends: State['domain']['friends'];
  networks: State['domain']['networks'];
  channelList: State['transient']['channelList'];
  channelListNetwork: ChatPaneProps['channelListNetwork'];
  selectedMessages: ChatPaneProps['selectedMessages'];
  workspace: WorkspaceView;
  ui: Pick<AppUiState, 'messageDisplayMode' | 'scrollRef'>;
};

type DesktopNicklistModelParams = {
  actions: NicklistActionSet;
  friends: State['domain']['friends'];
};

export function useDesktopHeaderModel({
  dispatch,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  return useMemo(() => ({
    messageDisplayMode: ui.messageDisplayMode,
    showMessageDisplayModeToggle: import.meta.env.DEV,
    onMessageDisplayModeChange: ui.setMessageDisplayMode,
    onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
    onOpenPreferences: ui.openPreferences,
  }), [dispatch, ui.messageDisplayMode, ui.openPreferences, ui.setMessageDisplayMode]);
}

export function useDesktopSidebarModel({
  actions,
  friends,
  friendPresence,
  sidebarConnections,
}: DesktopSidebarModelParams): DesktopShellModel['sidebar'] {
  return useMemo(() => ({
    connections: sidebarConnections,
    friends,
    friendPresence,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectFriend: actions.selectFriend,
    onSelectNetwork: actions.selectNetworkBuffer,
    onSelectBuffer: actions.selectTabBuffer,
    onSelectPendingChannel: actions.selectPendingTab,
    onReconnectNetwork: actions.reconnectNetwork,
    onDisconnectNetwork: actions.disconnectNetwork,
    onCloseConnection: actions.closeConnection,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  }), [
    actions.addFriend,
    actions.closeBuffer,
    actions.closeChannel,
    actions.closeConnection,
    actions.disconnectNetwork,
    actions.reconnectNetwork,
    actions.removeFriend,
    actions.selectFriend,
    actions.selectNetworkBuffer,
    actions.selectPendingTab,
    actions.selectTabBuffer,
    friendPresence,
    friends,
    sidebarConnections,
  ]);
}

export function useDesktopChatModel({
  actions,
  composer,
  friends,
  networks,
  channelList,
  channelListNetwork,
  selectedMessages,
  workspace,
  ui,
}: DesktopChatModelParams): DesktopShellModel['chat'] {
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);
  const canClearHistory =
    workspace.selectedBuffer?.kind === 'channel'
    || workspace.selectedBuffer?.kind === 'query';
  const clearHistoryBufferId = canClearHistory ? workspace.selectedBuffer?.id ?? null : null;
  return useMemo(() => ({
    workspace,
    friends,
    selectedMessages,
    draft: composer.draft,
    messageDisplayMode: ui.messageDisplayMode,
    scrollRef: ui.scrollRef,
    onDraftChange: composer.setDraft,
    onRecallOlderDraft: composer.recallOlderDraft,
    onRecallNewerDraft: composer.recallNewerDraft,
    onSend: actions.sendComposer,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    showChannelAutoJoin: channelAutoJoin.available,
    channelAutoJoinActive: channelAutoJoin.active,
    onToggleChannelAutoJoin: actions.toggleCurrentChannelAutoJoin,
    canClearHistory,
    onClearHistory: clearHistoryBufferId
      ? () => actions.clearBufferHistory(clearHistoryBufferId)
      : undefined,
    channelList,
    channelListNetwork,
    onCloseChannelList: actions.closeChannelList,
    onJoinChannelFromList: actions.joinChannelFromList,
    onOpenMentionedChannel: actions.openMentionedChannel,
    onOpenChannelList: actions.openChannelList,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  }), [
    actions.addFriend,
    actions.closeBuffer,
    actions.clearBufferHistory,
    actions.closeChannel,
    actions.closeChannelList,
    actions.joinChannelFromList,
    actions.openChannelList,
    actions.openMentionedChannel,
    actions.removeFriend,
    actions.sendComposer,
    actions.toggleCurrentChannelAutoJoin,
    channelList,
    channelAutoJoin.active,
    channelAutoJoin.available,
    channelListNetwork,
    canClearHistory,
    clearHistoryBufferId,
    composer.draft,
    composer.recallNewerDraft,
    composer.recallOlderDraft,
    composer.setDraft,
    friends,
    networks,
    selectedMessages,
    ui.messageDisplayMode,
    ui.scrollRef,
    workspace,
  ]);
}

export function useDesktopNicklistModel({
  actions,
  friends,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(() => ({
    friends,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    onSelectNick: actions.selectPrivateBuffer,
  }), [actions.addFriend, actions.removeFriend, actions.selectPrivateBuffer, friends]);
}
