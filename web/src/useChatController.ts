import type { State } from './app-types.js';
import type { DesktopShellProps } from './DesktopShell.js';
import type { useAppActions } from './useAppActions.js';
import type { useAppDerivedState } from './useAppDerivedState.js';
import type { useAppUiState } from './useAppUiState.js';
import type { useComposerHistory } from './composer-history.js';

type ChatControllerParams = {
  actions: ReturnType<typeof useAppActions>;
  composer: ReturnType<typeof useComposerHistory>;
  derived: ReturnType<typeof useAppDerivedState>;
  state: State;
  ui: ReturnType<typeof useAppUiState>;
};

export function useChatController({
  actions,
  composer,
  derived,
  state,
  ui,
}: ChatControllerParams): DesktopShellProps['chat'] {
  return {
    workspace: derived.workspace,
    friends: state.domain.friends,
    selectedMessages: derived.selectedMessages,
    draft: composer.draft,
    messageDisplayMode: ui.messageDisplayMode,
    scrollRef: ui.scrollRef,
    onDraftChange: composer.setDraft,
    onRecallOlderDraft: composer.recallOlderDraft,
    onRecallNewerDraft: composer.recallNewerDraft,
    onSend: actions.sendComposer,
    onAddFriend: actions.addFriend,
    onRemoveFriend: actions.removeFriend,
    channelList: state.transient.channelList,
    channelListNetwork: derived.channelListNetwork,
    onCloseChannelList: actions.closeChannelList,
    onJoinChannelFromList: actions.joinChannelFromList,
    onOpenMentionedChannel: actions.openMentionedChannel,
    onOpenChannelList: actions.openChannelList,
    onCloseChannel: actions.closeChannel,
    onCloseBuffer: actions.closeBuffer,
  };
}
