import { useMemo } from 'react';
import type { ChatPaneProps } from './ChatPane.js';
import { sendComposerAndFollowBottom } from './chat-pane-send.js';
import type { ConnectionSidebarProps } from './ConnectionSidebar.js';
import type { Action, State } from './app-types.js';
import {
  isBackgroundDmAudioContactAllowed,
  type BackgroundDmAudioContact,
  type BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import { buildComposerCompletionModel } from './composer-completion.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { ComposerController } from './composer-history.js';
import type { AppUiState } from './useAppUiState.js';
import type {
  ChatActionSet,
  NicklistActionSet,
  SidebarActionSet,
} from './useAppActions.js';
import type { SelectedBufferHistoryControls } from './useSelectedBufferEffects.js';
import type { WorkspaceView } from './workspace-types.js';

type DesktopHeaderModelParams = {
  dispatch: (action: Action) => void;
  ui: Pick<
    AppUiState,
    'messageDisplayMode' | 'openPreferences' | 'setMessageDisplayMode'
  >;
};

type DesktopSidebarModelParams = {
  actions: SidebarActionSet;
  friends: State['domain']['friends'];
  friendPresence: State['domain']['friendPresence'];
  sidebarConnections: ConnectionSidebarProps['connections'];
};

type DesktopChatModelParams = {
  actions: ChatActionSet;
  backgroundDmAudio: {
    settings: BackgroundDmAudioSettings;
    addContact: (contact: BackgroundDmAudioContact) => void;
    removeContact: (contact: BackgroundDmAudioContact) => void;
  };
  composer: ComposerController;
  friends: State['domain']['friends'];
  networks: State['domain']['networks'];
  primeBackgroundDmAudio: () => void;
  channelList: State['transient']['channelList'];
  channelListNetwork: ChatPaneProps['channelListNetwork'];
  selectedBufferHistory: SelectedBufferHistoryControls;
  selectedMessages: ChatPaneProps['selectedMessages'];
  workspace: WorkspaceView;
  ui: Pick<
    AppUiState,
    | 'bufferToolDialog'
    | 'closeBufferToolDialog'
    | 'forceScrollToBottomRef'
    | 'messageDisplayMode'
    | 'openBufferToolDialog'
    | 'scrollRef'
  >;
};

type DesktopNicklistModelParams = {
  actions: NicklistActionSet;
  friends: State['domain']['friends'];
};

export function useDesktopHeaderModel({
  dispatch,
  ui,
}: DesktopHeaderModelParams): DesktopShellModel['header'] {
  return useMemo(
    () => ({
      messageDisplayMode: ui.messageDisplayMode,
      showMessageDisplayModeToggle: import.meta.env.DEV,
      onMessageDisplayModeChange: ui.setMessageDisplayMode,
      onOpenNetworkManager: () => dispatch({ type: 'open-network-manager' }),
      onOpenPreferences: ui.openPreferences,
    }),
    [
      dispatch,
      ui.messageDisplayMode,
      ui.openPreferences,
      ui.setMessageDisplayMode,
    ],
  );
}

export function useDesktopSidebarModel({
  actions,
  friends,
  friendPresence,
  sidebarConnections,
}: DesktopSidebarModelParams): DesktopShellModel['sidebar'] {
  return useMemo(
    () => ({
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
    }),
    [
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
    ],
  );
}

export function useDesktopChatModel({
  actions,
  backgroundDmAudio,
  composer,
  friends,
  networks,
  primeBackgroundDmAudio,
  channelList,
  channelListNetwork,
  selectedBufferHistory,
  selectedMessages,
  workspace,
  ui,
}: DesktopChatModelParams): DesktopShellModel['chat'] {
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(
    networks,
    workspace,
  );
  const composerContextKey = workspace.selectedBuffer?.id ?? null;
  const draft = composer.getDraft(composerContextKey);
  const composerCompletion = useMemo(
    () => buildComposerCompletionModel(workspace),
    [workspace],
  );
  const canClearHistory =
    workspace.selectedBuffer?.kind === 'channel' ||
    workspace.selectedBuffer?.kind === 'query';
  const canDownloadHistory = canClearHistory;
  const canImportHistory = canClearHistory;
  const canRepairSelfNickAliases = canClearHistory;
  const selectedQueryNotificationContact =
    workspace.selectedBuffer?.kind === 'query'
      ? {
          networkId: workspace.selectedBuffer.networkId,
          nick: workspace.selectedBuffer.target,
        }
      : null;
  const queryNotificationsEnabled = selectedQueryNotificationContact
    ? isBackgroundDmAudioContactAllowed(backgroundDmAudio.settings, {
        kind: 'query',
        networkId: selectedQueryNotificationContact.networkId,
        target: selectedQueryNotificationContact.nick,
      })
    : false;
  const participantQueryNetwork =
    workspace.selectedBuffer?.kind === 'channel'
      ? workspace.selectedNetwork
      : null;
  const selectedNetwork = workspace.selectedNetwork;
  const clearHistoryBufferId = canClearHistory
    ? (workspace.selectedBuffer?.id ?? null)
    : null;
  const downloadHistoryBufferId = canDownloadHistory
    ? (workspace.selectedBuffer?.id ?? null)
    : null;
  const importHistoryBufferId = canImportHistory
    ? (workspace.selectedBuffer?.id ?? null)
    : null;
  const repairSelfNickAliasesBufferId = canRepairSelfNickAliases
    ? (workspace.selectedBuffer?.id ?? null)
    : null;
  const historyImportOpen =
    ui.bufferToolDialog?.kind === 'history-import' &&
    ui.bufferToolDialog.bufferId === importHistoryBufferId;
  const selfNickAliasesOpen =
    ui.bufferToolDialog?.kind === 'self-aliases' &&
    ui.bufferToolDialog.bufferId === repairSelfNickAliasesBufferId;
  return useMemo(
    () => ({
      workspace,
      friends,
      selectedMessages,
      draft,
      focusContextKey: composerContextKey,
      completionEnabled: composerCompletion.enabled,
      completionContextKey: composerCompletion.contextKey,
      completionCandidates: composerCompletion.candidates,
      messageDisplayMode: ui.messageDisplayMode,
      scrollRef: ui.scrollRef,
      onDraftChange: (value) => composer.setDraft(composerContextKey, value),
      onRecallOlderDraft: () => composer.recallOlderDraft(composerContextKey),
      onRecallNewerDraft: () => composer.recallNewerDraft(composerContextKey),
      onSend: () =>
        sendComposerAndFollowBottom({
          sendComposer: actions.sendComposer,
          forceScrollToBottomRef: ui.forceScrollToBottomRef,
        }),
      queryNotificationsEnabled,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onToggleQueryNotifications: selectedQueryNotificationContact
        ? () => {
            if (queryNotificationsEnabled) {
              backgroundDmAudio.removeContact(selectedQueryNotificationContact);
              return;
            }
            backgroundDmAudio.addContact(selectedQueryNotificationContact);
            if (backgroundDmAudio.settings.enabled) {
              primeBackgroundDmAudio();
            }
          }
        : undefined,
      showChannelAutoJoin: channelAutoJoin.available,
      channelAutoJoinActive: channelAutoJoin.active,
      onToggleChannelAutoJoin: actions.toggleCurrentChannelAutoJoin,
      canClearHistory,
      onClearHistory: clearHistoryBufferId
        ? () => actions.clearBufferHistory(clearHistoryBufferId)
        : undefined,
      canDownloadHistory,
      onDownloadHistory: downloadHistoryBufferId
        ? () => actions.downloadBufferHistory(downloadHistoryBufferId)
        : undefined,
      canImportHistory,
      historyImportOpen,
      onOpenHistoryImport: importHistoryBufferId
        ? () => ui.openBufferToolDialog('history-import', importHistoryBufferId)
        : undefined,
      onCloseHistoryImport: ui.closeBufferToolDialog,
      onImportHistory: importHistoryBufferId
        ? (input) => actions.importBufferHistory(importHistoryBufferId, input)
        : undefined,
      selfNickAliasesOpen,
      onOpenSelfNickAliases: repairSelfNickAliasesBufferId
        ? () =>
            ui.openBufferToolDialog(
              'self-aliases',
              repairSelfNickAliasesBufferId,
            )
        : undefined,
      onCloseSelfNickAliases: ui.closeBufferToolDialog,
      onUpdateSelfNickAliases: repairSelfNickAliasesBufferId
        ? (input) =>
            actions.updateBufferSelfNickAliases(
              repairSelfNickAliasesBufferId,
              input,
            )
        : undefined,
      canLoadOlderHistory: selectedBufferHistory.canLoadOlderHistory,
      loadingOlderHistory: selectedBufferHistory.isLoadingOlderHistory,
      onLoadOlderHistory: selectedBufferHistory.loadOlderHistory,
      channelList,
      channelListNetwork,
      onCloseChannelList: actions.closeChannelList,
      onJoinChannelFromList: actions.joinChannelFromList,
      onOpenMentionedChannel: actions.openMentionedChannel,
      onOpenParticipantQuery: participantQueryNetwork
        ? (nick) => {
            void actions.selectPrivateBuffer(participantQueryNetwork, nick);
          }
        : undefined,
      onOpenChannelList: actions.openChannelList,
      onReconnectNetwork: selectedNetwork
        ? () => actions.reconnectNetwork(selectedNetwork)
        : undefined,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    }),
    [
      actions.addFriend,
      backgroundDmAudio.addContact,
      backgroundDmAudio.removeContact,
      backgroundDmAudio.settings,
      actions.closeBuffer,
      actions.clearBufferHistory,
      actions.closeChannel,
      actions.closeChannelList,
      actions.downloadBufferHistory,
      actions.importBufferHistory,
      actions.updateBufferSelfNickAliases,
      actions.joinChannelFromList,
      actions.openChannelList,
      actions.openMentionedChannel,
      actions.reconnectNetwork,
      actions.removeFriend,
      actions.selectPrivateBuffer,
      actions.sendComposer,
      actions.toggleCurrentChannelAutoJoin,
      primeBackgroundDmAudio,
      channelList,
      channelAutoJoin.active,
      channelAutoJoin.available,
      channelListNetwork,
      composer,
      composerContextKey,
      composerCompletion.candidates,
      composerCompletion.contextKey,
      composerCompletion.enabled,
      canClearHistory,
      canDownloadHistory,
      canImportHistory,
      historyImportOpen,
      selectedBufferHistory,
      clearHistoryBufferId,
      downloadHistoryBufferId,
      importHistoryBufferId,
      selfNickAliasesOpen,
      repairSelfNickAliasesBufferId,
      participantQueryNetwork,
      queryNotificationsEnabled,
      draft,
      friends,
      networks,
      selectedQueryNotificationContact,
      selectedMessages,
      selectedNetwork,
      ui.messageDisplayMode,
      ui.openBufferToolDialog,
      ui.closeBufferToolDialog,
      ui.forceScrollToBottomRef,
      ui.scrollRef,
      workspace,
    ],
  );
}

export function useDesktopNicklistModel({
  actions,
  friends,
}: DesktopNicklistModelParams): DesktopShellModel['nicklist'] {
  return useMemo(
    () => ({
      friends,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onSelectNick: actions.selectPrivateBuffer,
    }),
    [
      actions.addFriend,
      actions.removeFriend,
      actions.selectPrivateBuffer,
      friends,
    ],
  );
}
