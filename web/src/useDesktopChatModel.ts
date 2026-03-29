import { useMemo } from 'react';
import { sendComposerAndFollowBottom } from './chat-pane-send.js';
import {
  isBackgroundDmAudioContactAllowed,
  type BackgroundDmAudioContact,
  type BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import { buildComposerCompletionModel } from './composer-completion.js';
import type { ComposerController } from './composer-history.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { Action, State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import type { AppUiState } from './useAppUiState.js';
import type { ChatActionSet } from './useAppActions.js';
import type { SelectedBufferHistoryControls } from './useSelectedBufferEffects.js';
import type { WorkspaceView } from './workspace-types.js';

export type DesktopChatModelParams = {
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
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);
  const composerContextKey = workspace.selectedBuffer?.id ?? null;
  const draft = composer.getDraft(composerContextKey);
  const composerCompletion = useMemo(() => buildComposerCompletionModel(workspace), [workspace]);
  const canClearHistory =
    workspace.selectedBuffer?.kind === 'channel'
    || workspace.selectedBuffer?.kind === 'query';
  const selectedBufferId = canClearHistory ? workspace.selectedBuffer?.id ?? null : null;
  const selectedQueryNotificationContact = workspace.selectedBuffer?.kind === 'query'
    ? { networkId: workspace.selectedBuffer.networkId, nick: workspace.selectedBuffer.target }
    : null;
  const queryNotificationsEnabled = selectedQueryNotificationContact
    ? isBackgroundDmAudioContactAllowed(backgroundDmAudio.settings, {
        kind: 'query',
        networkId: selectedQueryNotificationContact.networkId,
        target: selectedQueryNotificationContact.nick,
      })
    : false;
  const participantQueryNetwork = workspace.selectedBuffer?.kind === 'channel'
    ? workspace.selectedNetwork
    : null;
  const selectedNetwork = workspace.selectedNetwork;
  const historyImportOpen =
    ui.bufferToolDialog?.kind === 'history-import'
    && ui.bufferToolDialog.bufferId === selectedBufferId;
  const selfNickAliasesOpen =
    ui.bufferToolDialog?.kind === 'self-aliases'
    && ui.bufferToolDialog.bufferId === selectedBufferId;

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
      onClearHistory: selectedBufferId ? () => actions.clearBufferHistory(selectedBufferId) : undefined,
      canDownloadHistory: canClearHistory,
      onDownloadHistory: selectedBufferId ? () => actions.downloadBufferHistory(selectedBufferId) : undefined,
      canImportHistory: canClearHistory,
      historyImportOpen,
      onOpenHistoryImport: selectedBufferId
        ? () => ui.openBufferToolDialog('history-import', selectedBufferId)
        : undefined,
      onCloseHistoryImport: ui.closeBufferToolDialog,
      onImportHistory: selectedBufferId
        ? (input) => actions.importBufferHistory(selectedBufferId, input)
        : undefined,
      selfNickAliasesOpen,
      onOpenSelfNickAliases: selectedBufferId
        ? () => ui.openBufferToolDialog('self-aliases', selectedBufferId)
        : undefined,
      onCloseSelfNickAliases: ui.closeBufferToolDialog,
      onUpdateSelfNickAliases: selectedBufferId
        ? (input) => actions.updateBufferSelfNickAliases(selectedBufferId, input)
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
        ? (nick) => void actions.selectPrivateBuffer(participantQueryNetwork, nick)
        : undefined,
      onOpenChannelList: actions.openChannelList,
      onReconnectNetwork: selectedNetwork ? () => actions.reconnectNetwork(selectedNetwork) : undefined,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    }),
    [
      actions,
      backgroundDmAudio,
      channelAutoJoin,
      channelList,
      channelListNetwork,
      composer,
      composerCompletion,
      composerContextKey,
      draft,
      friends,
      historyImportOpen,
      participantQueryNetwork,
      primeBackgroundDmAudio,
      queryNotificationsEnabled,
      selectedBufferHistory,
      selectedBufferId,
      selectedMessages,
      selectedNetwork,
      selectedQueryNotificationContact,
      selfNickAliasesOpen,
      ui,
      workspace,
    ],
  );
}
