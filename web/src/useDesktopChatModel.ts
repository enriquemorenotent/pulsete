import { useMemo } from 'react';
import { resolveCurrentChannelAutoJoinState } from './channel-autojoin.js';
import { buildComposerCompletionModel } from './composer-completion.js';
import {
  useComposerDraft,
  type ComposerStoreApi,
} from './composer-store.js';
import {
  resolveContactRuleState,
  type ContactRuleHandlers,
} from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { ChatPaneProps } from './ChatPane.js';
import type { State } from './app-types.js';
import type { DesktopShellModel } from './desktop-shell-model.js';
import { resolveUserAvatarCandidate } from './user-avatars/irccloud.js';
import type { ChatActionSet } from './useAppActions.js';
import type { SelectedBufferHistoryControls } from './transcript/history.js';
import type { WorkspaceView } from './workspace-types.js';

export type DesktopChatModelParams = {
  actions: ChatActionSet;
  composer: ComposerStoreApi;
  contactNotifications: Pick<ContactNotificationsController, 'settings'>;
  contactRuleHandlers: ContactRuleHandlers;
  channels: State['domain']['channels'];
  externalAvatarsEnabled: boolean;
  friends: State['domain']['friends'];
  mutedNicks: State['domain']['mutedNicks'];
  nickEmojis: State['domain']['nickEmojis'];
  networks: State['domain']['networks'];
  channelList: State['transient']['channelList'];
  channelListNetwork: ChatPaneProps['channelListNetwork'];
  selectedBufferHistory: SelectedBufferHistoryControls;
  selectedMessages: ChatPaneProps['selectedMessages'];
  workspace: WorkspaceView;
};

export function useDesktopChatModel({
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
}: DesktopChatModelParams): DesktopShellModel['chat'] {
  const channelAutoJoin = resolveCurrentChannelAutoJoinState(networks, workspace);
  const composerContextKey = workspace.selectedBuffer?.id ?? null;
  const draft = useComposerDraft(composer, composerContextKey);
  const composerCompletion = useMemo(() => buildComposerCompletionModel(workspace), [workspace]);
  const canUseBufferHistoryTools =
    workspace.selectedBuffer?.kind === 'channel'
    || workspace.selectedBuffer?.kind === 'query';
  const selectedBufferId = canUseBufferHistoryTools ? workspace.selectedBuffer?.id ?? null : null;
  const selectedQueryBuffer = workspace.selectedBuffer?.kind === 'query'
    ? workspace.selectedBuffer
    : null;
  const selectedQueryAvatarUser = useMemo(() => {
    const selectedBuffer = workspace.selectedBuffer;
    return selectedBuffer?.kind === 'query'
      ? resolveUserAvatarCandidate(
          channels,
          selectedBuffer.networkId,
          selectedBuffer.target,
          selectedBuffer.ircCloudAvatarId,
        )
      : null;
  }, [channels, workspace.selectedBuffer]);
  const selectedQueryIdentity = workspace.selectedBuffer?.kind === 'query'
    ? selectedQueryAvatarUser?.identity ?? workspace.selectedBuffer.peerIdentity
    : null;
  const selectedQueryContactRule = workspace.selectedBuffer?.kind === 'query'
    ? resolveContactRuleState({
        networkId: workspace.selectedBuffer.networkId,
        nick: workspace.selectedBuffer.target,
        identity: selectedQueryIdentity,
        friends,
        mutedNicks,
        contactNotifications: contactNotifications.settings,
      })
    : null;
  const participantQueryNetwork = workspace.selectedBuffer?.kind === 'channel'
    ? workspace.selectedNetwork
    : null;
  const selectedNetwork = workspace.selectedNetwork;

  return useMemo(
    () => ({
      workspace,
      nickEmojis,
      externalAvatarsEnabled,
      selectedQueryAvatarUser,
      selectedMessages,
      mutedNicks,
      contactRuleHandlers,
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
      selectedQueryContactRule,
      mutedQueryNick: selectedQueryContactRule?.mutedNick?.nick ?? null,
      onWhoisSelectedQuery: selectedQueryContactRule
        ? () =>
            actions.requestWhois(
              selectedQueryContactRule.contact.networkId,
              selectedQueryContactRule.contact.nick,
              workspace.selectedBuffer?.id,
            )
        : undefined,
      showChannelAutoJoin: channelAutoJoin.available,
      channelAutoJoinActive: channelAutoJoin.active,
      onToggleChannelAutoJoin: actions.toggleCurrentChannelAutoJoin,
      canDownloadHistory: canUseBufferHistoryTools,
      onDownloadHistory: selectedBufferId ? () => actions.downloadBufferHistory(selectedBufferId) : undefined,
      canDeleteHistory: Boolean(selectedQueryBuffer),
      onDeleteHistory: selectedQueryBuffer ? actions.clearBufferHistory : undefined,
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
        ? (nick, identity) => void actions.selectPrivateBuffer(participantQueryNetwork, nick, identity)
        : undefined,
      onOpenChannelList: actions.openChannelList,
      onReconnectNetwork: selectedNetwork ? () => actions.reconnectNetwork(selectedNetwork) : undefined,
      onCloseChannel: actions.closeChannel,
      onCloseBuffer: actions.closeBuffer,
    }),
    [
      actions,
      channelAutoJoin,
      channelList,
      channelListNetwork,
      contactRuleHandlers,
      composer,
      composerCompletion,
      composerContextKey,
      contactNotifications.settings,
      draft,
      externalAvatarsEnabled,
      friends,
      mutedNicks,
      nickEmojis,
      participantQueryNetwork,
      selectedQueryIdentity,
      selectedQueryContactRule,
      selectedQueryAvatarUser,
      selectedQueryBuffer,
      selectedBufferHistory,
      selectedBufferId,
      selectedMessages,
      selectedNetwork,
      workspace,
    ],
  );
}
