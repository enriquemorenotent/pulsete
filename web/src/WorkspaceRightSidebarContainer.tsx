import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar.js';
import { openExistingNetworkEditor } from './network-editor-actions.js';
import {
  selectFriends,
  selectMutedNicks,
  selectNickEmojis,
  selectPinnedMessagesByConversation,
  selectPinnedMessagesLoadedByBufferId,
  selectPreferences,
  selectServerProfileNetwork,
  selectWorkspace,
} from './app-selectors.js';
import { useAppDispatch, useAppSelector } from './app-store.js';
import type { ComposerStoreApi } from './composer-store.js';
import type { ContactRuleHandlers } from './contact-notifications/contact-rules.js';
import type { ContactNotificationsController } from './contact-notifications/controller.js';
import type { MediaVisibilityPolicy } from './media-visibility-settings.js';
import { useDesktopNicklistModel } from './useDesktopShellModel.js';
import type { AppActions } from './useAppActions.js';
import type { AiAssistantStoreApi } from './ai-assistant-store.js';
import type { PinnedMessagesLoadState } from './PinnedMessagesSidebar.js';

type WorkspaceRightSidebarContainerProps = {
  actions: AppActions;
  assistantStore: AiAssistantStoreApi;
  composer: ComposerStoreApi;
  contactNotifications: ContactNotificationsController;
  contactRuleHandlers: ContactRuleHandlers;
  externalAvatarsEnabled: boolean;
  mediaPolicy: MediaVisibilityPolicy;
  onCollapse: () => void;
};

export const WorkspaceRightSidebarContainer = memo(function WorkspaceRightSidebarContainer({
  actions,
  assistantStore,
  composer,
  contactNotifications,
  contactRuleHandlers,
  externalAvatarsEnabled,
  mediaPolicy,
  onCollapse,
}: WorkspaceRightSidebarContainerProps) {
  const dispatch = useAppDispatch();
  const friends = useAppSelector(selectFriends);
  const mutedNicks = useAppSelector(selectMutedNicks);
  const nickEmojis = useAppSelector(selectNickEmojis);
  const pinnedMessagesByConversation = useAppSelector(selectPinnedMessagesByConversation);
  const pinnedMessagesLoadedByBufferId = useAppSelector(selectPinnedMessagesLoadedByBufferId);
  const serverProfileNetwork = useAppSelector(selectServerProfileNetwork);
  const workspace = useAppSelector(selectWorkspace);
  const preferences = useAppSelector(selectPreferences);
  const queryBuffer = workspace.selectedBuffer?.kind === 'query'
    ? workspace.selectedBuffer
    : null;
  const queryBufferId = queryBuffer?.id ?? null;
  const pinnedMessagesLoaded = queryBufferId
    ? pinnedMessagesLoadedByBufferId[queryBufferId] === true
    : false;
  const [pinnedMessagesLoad, setPinnedMessagesLoad] = useState<{
    bufferId: string | null;
    state: PinnedMessagesLoadState;
  }>({ bufferId: null, state: 'idle' });
  const loadPinnedMessages = useCallback(async () => {
    if (!queryBufferId) {
      return false;
    }
    const bufferId = queryBufferId;
    setPinnedMessagesLoad({ bufferId, state: 'loading' });
    const loaded = await actions.loadPinnedMessages(bufferId);
    setPinnedMessagesLoad((current) =>
      current.bufferId === bufferId
        ? { bufferId, state: loaded ? 'loaded' : 'error' }
        : current,
    );
    return loaded;
  }, [actions.loadPinnedMessages, queryBufferId]);
  useEffect(() => {
    if (!queryBufferId) {
      setPinnedMessagesLoad({ bufferId: null, state: 'idle' });
      return;
    }
    if (pinnedMessagesLoaded) {
      setPinnedMessagesLoad({ bufferId: queryBufferId, state: 'loaded' });
      return;
    }
    void loadPinnedMessages();
  }, [loadPinnedMessages, pinnedMessagesLoaded, queryBufferId]);
  const nicklist = useDesktopNicklistModel({
    actions,
    contactNotifications,
    contactRuleHandlers,
    externalAvatarsEnabled,
    friends,
    mediaPolicy,
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
    accordionState: serverProfileNetwork
      ? preferences.serverSidebarAccordions[serverProfileNetwork.id] ?? {}
      : {},
    onSetAccordionState: (state: import('./server-sidebar-accordion-state.js').ServerSidebarAccordionState) => {
      if (!serverProfileNetwork) {
        return;
      }
      void actions.updatePreferences({
        serverSidebarAccordions: {
          ...preferences.serverSidebarAccordions,
          [serverProfileNetwork.id]: state,
        },
      });
    },
  }), [
    actions.saveNetworkNotes,
    actions.updatePreferences,
    dispatch,
    preferences.serverSidebarAccordions,
    serverProfileNetwork,
  ]);
  const queryProfile = useMemo(() => {
    return {
      buffer: queryBuffer,
      pinnedMessages: queryBufferId
        ? pinnedMessagesByConversation[queryBufferId] ?? []
        : [],
      pinnedMessagesLoadState: pinnedMessagesLoad.bufferId === queryBufferId
        ? pinnedMessagesLoad.state
        : 'idle' as const,
      onJumpToPinnedMessage: actions.jumpToPinnedMessage,
      onRetryPinnedMessages: () => void loadPinnedMessages(),
      onSaveNotes: actions.saveBufferNotes,
      onUnpinMessage: (bufferId: string, messageId: string) =>
        actions.setMessagePinned(bufferId, messageId, false),
    };
  }, [
    actions.jumpToPinnedMessage,
    actions.saveBufferNotes,
    actions.setMessagePinned,
    loadPinnedMessages,
    pinnedMessagesByConversation,
    pinnedMessagesLoad,
    queryBuffer,
    queryBufferId,
  ]);
  const assistant = useMemo(() => {
    const buffer = workspace.selectedBuffer?.kind === 'channel'
      || workspace.selectedBuffer?.kind === 'query'
      ? workspace.selectedBuffer
      : null;
    return {
      buffer,
      onSelectionChange: (selection: typeof preferences.aiAssistant) =>
        actions.updatePreferences({ aiAssistant: selection }),
      onUseSuggestion: (value: string) => composer.setDraft(buffer?.id ?? null, value),
      selection: preferences.aiAssistant,
      store: assistantStore,
    };
  }, [
    actions.updatePreferences,
    assistantStore,
    composer,
    preferences.aiAssistant,
    workspace.selectedBuffer,
  ]);
  return (
    <WorkspaceRightSidebar
      workspace={workspace}
      nicklist={nicklist}
      assistant={assistant}
      serverProfile={serverProfile}
      queryProfile={queryProfile}
      onCollapse={onCollapse}
    />
  );
});
