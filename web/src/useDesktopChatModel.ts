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
import {
  enableContactNotificationsAndUnmute,
  muteContactAndDisableNotifications,
  type ContactRuleMutedState,
} from './contact-rule-actions.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { findMutedNick } from './muted-nick-utils.js';
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
};

export const resolveQueryNotificationsEnabled = (input: {
  contact: BackgroundDmAudioContact | null;
  mutedNick: ContactRuleMutedState;
  settings: BackgroundDmAudioSettings;
}) => {
  if (!input.contact || input.mutedNick) {
    return false;
  }
  return isBackgroundDmAudioContactAllowed(input.settings, {
    kind: 'query',
    networkId: input.contact.networkId,
    target: input.contact.nick,
  });
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
  const queryNotificationsEnabled = resolveQueryNotificationsEnabled({
    contact: selectedQueryNotificationContact,
    mutedNick: selectedMutedNick,
    settings: backgroundDmAudio.settings,
  });
  const participantQueryNetwork = workspace.selectedBuffer?.kind === 'channel'
    ? workspace.selectedNetwork
    : null;
  const selectedNetwork = workspace.selectedNetwork;

  return useMemo(
    () => ({
      workspace,
      friends,
      selectedMessages,
      mutedNicks,
      draft,
      focusContextKey: composerContextKey,
      completionEnabled: composerCompletion.enabled,
      completionContextKey: composerCompletion.contextKey,
      completionCandidates: composerCompletion.candidates,
      completionCommandCandidates: composerCompletion.commandCandidates,
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
        ? () => muteContactAndDisableNotifications({
            contact: selectedQueryNotificationContact,
            addMutedNick: actions.addMutedNick,
            removeNotificationContact: backgroundDmAudio.removeContact,
          })
        : undefined,
      onUnmuteSelectedQuery: selectedMutedNick
        ? () => actions.removeMutedNick(selectedMutedNick.id)
        : undefined,
      onToggleQueryNotifications: selectedQueryNotificationContact
        ? () => {
            if (queryNotificationsEnabled) {
              backgroundDmAudio.removeContact(selectedQueryNotificationContact);
              return;
            }
            void enableContactNotificationsAndUnmute({
              contact: selectedQueryNotificationContact,
              mutedNick: selectedMutedNick,
              removeMutedNick: actions.removeMutedNick,
              addNotificationContact: backgroundDmAudio.addContact,
              onNotificationsEnabled: backgroundDmAudio.settings.enabled
                ? primeBackgroundDmAudio
                : undefined,
            });
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
      canSearchHistory: canUseBufferHistoryTools,
      onSearchHistory: selectedBufferId
        ? (bufferId, query, init) => actions.searchBufferHistory(bufferId, query, init)
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
      participantQueryNetwork,
      primeBackgroundDmAudio,
      queryNotificationsEnabled,
      selectedMutedNick,
      selectedBufferHistory,
      selectedBufferId,
      selectedMessages,
      selectedNetwork,
      selectedQueryNotificationContact,
      workspace,
    ],
  );
}
