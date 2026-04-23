import { useMemo } from 'react';
import {
  isBackgroundDmAudioContactAllowed,
  type BackgroundDmAudioContact,
  type BackgroundDmAudioSettings,
} from './background-dm-audio.js';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import { buildComposerCompletionModel } from './composer-completion.js';
import {
  useComposerDraft,
  type ComposerStoreApi,
} from './composer-store.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { filterMutedMessages, findMutedNick } from './muted-nick-utils.js';
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
  composer: ComposerStoreApi;
  friends: State['domain']['friends'];
  mutedNicks: State['domain']['mutedNicks'];
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
    | 'messageDisplayMode'
    | 'openBufferToolDialog'
  >;
};

export function useDesktopChatModel({
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
}: DesktopChatModelParams): DesktopShellModel['chat'] {
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);
  const composerContextKey = workspace.selectedBuffer?.id ?? null;
  const draft = useComposerDraft(composer, composerContextKey);
  const composerCompletion = useMemo(() => buildComposerCompletionModel(workspace), [workspace]);
  const canUseBufferHistoryTools =
    workspace.selectedBuffer?.kind === 'channel'
    || workspace.selectedBuffer?.kind === 'query';
  const selectedBufferId = canUseBufferHistoryTools ? workspace.selectedBuffer?.id ?? null : null;
  const selectedQueryNotificationContact = workspace.selectedBuffer?.kind === 'query'
    ? { networkId: workspace.selectedBuffer.networkId, nick: workspace.selectedBuffer.target }
    : null;
  const selectedMutedNick = workspace.selectedBuffer?.kind === 'query'
    ? findMutedNick(mutedNicks, workspace.selectedBuffer.networkId, workspace.selectedBuffer.target)
    : null;
  const queryNotificationsEnabled = selectedQueryNotificationContact
    ? isBackgroundDmAudioContactAllowed(backgroundDmAudio.settings, {
        kind: 'query',
        networkId: selectedQueryNotificationContact.networkId,
        target: selectedQueryNotificationContact.nick,
      })
    : false;
  const visibleSelectedMessages = useMemo(
    () => filterMutedMessages(selectedMessages, mutedNicks),
    [mutedNicks, selectedMessages],
  );
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
      selectedMessages: visibleSelectedMessages,
      draft,
      focusContextKey: composerContextKey,
      completionEnabled: composerCompletion.enabled,
      completionContextKey: composerCompletion.contextKey,
      completionCandidates: composerCompletion.candidates,
      messageDisplayMode: ui.messageDisplayMode,
      onDraftChange: (value) => composer.setDraft(composerContextKey, value),
      onRecallOlderDraft: () => composer.recallOlderDraft(composerContextKey),
      onRecallNewerDraft: () => composer.recallNewerDraft(composerContextKey),
      onSend: actions.sendComposer,
      selectedQueryMuted: Boolean(selectedMutedNick),
      mutedQueryNick: selectedMutedNick?.nick ?? null,
      queryNotificationsEnabled,
      onAddFriend: actions.addFriend,
      onRemoveFriend: actions.removeFriend,
      onMuteSelectedQuery: selectedQueryNotificationContact
        ? () => actions.addMutedNick(selectedQueryNotificationContact.networkId, selectedQueryNotificationContact.nick)
        : undefined,
      onUnmuteSelectedQuery: selectedMutedNick
        ? () => actions.removeMutedNick(selectedMutedNick.id)
        : undefined,
      onToggleQueryNotifications: selectedQueryNotificationContact && !selectedMutedNick
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
      onWhoisSelectedQuery: selectedQueryNotificationContact
        ? () =>
            actions.requestWhois(
              selectedQueryNotificationContact.networkId,
              selectedQueryNotificationContact.nick,
              workspace.selectedBuffer?.id,
            )
        : undefined,
      showChannelAutoJoin: channelAutoJoin.available,
      channelAutoJoinActive: channelAutoJoin.active,
      onToggleChannelAutoJoin: actions.toggleCurrentChannelAutoJoin,
      canDownloadHistory: canUseBufferHistoryTools,
      onDownloadHistory: selectedBufferId ? () => actions.downloadBufferHistory(selectedBufferId) : undefined,
      canImportHistory: canUseBufferHistoryTools,
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
      initialHistoryPending: selectedBufferHistory.initialHistoryPending,
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
      mutedNicks,
      historyImportOpen,
      participantQueryNetwork,
      primeBackgroundDmAudio,
      queryNotificationsEnabled,
      selectedMutedNick,
      selectedBufferHistory,
      selectedBufferId,
      visibleSelectedMessages,
      selectedNetwork,
      selectedQueryNotificationContact,
      selfNickAliasesOpen,
      ui,
      workspace,
    ],
  );
}
